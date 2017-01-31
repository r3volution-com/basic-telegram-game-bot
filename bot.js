//ToDo: menos spam usando el editar mensaje de la API2.0
//Cargamos los modulos necesarios
var TelegramBot = require('node-telegram-bot-api');
var privatedata = require('./privatedata');
var SecretHitlerBot = require('./game');
var emoji = require('node-emoji').emoji;

//Iniciamos el bot y mongodb
var bot = new TelegramBot(privatedata.token, {polling: true});

//Iniciamos el Bot
var game = new SecretHitlerBot(privatedata.url, function (res){
	if (res.status == "ERR") {
		console.error('No se ha podido conectar a la base de datos');
		return;
	}
	//////////////////////////////EVENTOS//////////////////////////////
	//Si el comando es /start (por privado):
	bot.onText(new RegExp("^\\/start(?:@"+privatedata.botalias+")?", "i"), function (msg, match) {	
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un privado.");
			return;
		}
		game.createUser({user_id: msg.from.id, username: game.getUsername(msg)}, function (res){
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_ALREADY_IN_GAME":
						bot.sendMessage(msg.chat.id, "Ya estas registrado en el juego.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			bot.sendMessage(msg.from.id, "Cuenta creada. Utiliza el comando /create en un grupo para crear una partida.");
		});
	});
	//Si el comando es /create y sus parametros son:
	//numero_de_players-> ([2-9])
	bot.onText(new RegExp("^\\/create(?:@"+privatedata.botalias+")?\\s([1-9])", "i"), function (msg, match) {	
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.sendMessage(msg.chat.id, "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			if (res.playing){
				bot.sendMessage(msg.chat.id, "Ya estas participando en otra partida.");
				return;
			}
			game.createGame({msg_id: msg.id, room_id: msg.chat.id, creator_id: res.msg._id, president_id: 0, n_players: match[1]}, function (game_res){
				//Capturamos errores
				if (game_res.status == "ERR") {
					switch (game_res.msg) {
						case "ERR_ACTIVE_GAME":
							bot.sendMessage(msg.chat.id, "Este grupo ya tiene una partida activa, su creador puede borrarla con /delete");
						break;
						default:
							bot.sendMessage(msg.chat.id, "Error inesperado.");
							console.log(game_res);
						break;
					}
					return;
				}
				game.joinGame({game_id: game_res.msg.game_id, player_id: res.msg._id, player_uid: res.msg.user_id, player_username: res.msg.username}, function (player_res){
					//Capturamos errores
					if (player_res.status == "ERR") {
						switch (player_res.msg) {
							default:
								bot.sendMessage(msg.chat.id, "Error inesperado.");
								console.log(player_res);
							break;
						}
						return;
					}
					//Creamos el array de botones para gestionar el grupo
					var opts = {
						reply_markup: JSON.stringify({
							inline_keyboard: [
								[{text: "Unirse a la partida", callback_data: "join_"+game_res.msg.game_id}],
								[{text: "Borrar la partida", callback_data: "delete_"+game_res.msg.game_id}],
								[{text: "Iniciar la partida", callback_data: "start_"+game_res.msg.game_id}]
							]
						})
					};
					bot.sendMessage(msg.chat.id, "Se ha creado la sala. Participantes:\n"+res.msg.username, opts);
					bot.sendMessage(res.msg.user_id, "Te has unido a una partida.");
				});
			});
		});
	});
	bot.on('callback_query', function (msg) {
		/*if (msg.message.chat.type == "private") {
			bot.answerCallbackQuery(msg.id, "Por favor envia este comando por un grupo.");
			return;
		}*/
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.answerCallbackQuery(msg.id, "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start.");
					break;
					default:
						bot.answerCallbackQuery(msg.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			var data = msg.data.split("_");
			if (data[0] == "join"){
				if (res.playing){
					bot.answerCallbackQuery(msg.id, "Ya estas participando en una partida.");
					return;
				}
				game.joinGame({game_id: data[1], player_id: res.msg._id, player_uid: res.msg.user_id, player_username: res.msg.username}, function (join_res){
					//Capturamos errores
					if (join_res.status == "ERR") {
						switch (join_res.msg) {
							case "ERR_UNKNOWN_GAME":
								bot.answerCallbackQuery(msg.id, "Esta partida no existe.");
							break;
							case "ERR_ALREADY_STARTED":
								bot.answerCallbackQuery(msg.id, "Esta partida ya está iniciada.");
							break;
							case "ERR_ALREADY_FILLED":
								bot.answerCallbackQuery(msg.id, "La partida ya está llena.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(join_res);
							break;
						}
						return;
					}
					//ToDo: añadir el nuevo miembro al mensaje
					//bot.editMessageText("", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
					bot.answerCallbackQuery(msg.id, 'Te has unido correctamente a la partida.');
					//Creamos el array de botones para gestionar el grupo
					var opts = {
						reply_markup: JSON.stringify({
							inline_keyboard: [
								[{text: "Dejar la partida", callback_data: "leave_"+data[1]}]
							]
						})
					};
					bot.sendMessage(res.msg.user_id, "Te has unido a una partida.", opts);
				});
			} else if (data[0] == "delete"){
				game.deleteGame(res.msg._id, data[1], function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "Esta partida ya está borrada.");
							break;
							case "ERR_CREATOR_DELETE":
								bot.answerCallbackQuery(msg.id, "Solo el creador puede borrar la partida.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					bot.editMessageText("Partida borrada", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
					bot.answerCallbackQuery(msg.id,  "Se ha borrado la partida.");
				});
			} else if (data[0] == "start"){
				game.startGame(res.msg._id, data[1], function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "Este grupo no tiene partidas activas.");
							break;
							case "ERR_NOT_CREATOR_START":
								bot.answerCallbackQuery(msg.id, "Solo el creador puede iniciar la partida.");
							break;
							case "ERR_ALREADY_STARTED":
								bot.answerCallbackQuery(msg.id, "La partida ya esta iniciada.");
							break;
							case "ERR_NOT_ENOUGHT_PLAYERS":
								bot.answerCallbackQuery(msg.id, "Aun no se ha llenado la partida. "+res.extra.current_players+" de "+res.extra.max_players+" participantes");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					//Iniciar la partida y la ronda
				});
			} else if (data[0] == "leave"){
				if (!res.playing){
					bot.answerCallbackQuery(msg.id, "No eres miembro de ninguna partida.");
					return;
				}
				game.leaveGame(res.msg._id, function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_GAME_PARTICIPANT":
								bot.answerCallbackQuery(msg.id, "No eres miembro de ninguna partida.");
							break;
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "La partida ya no está activa.");
							break;
							case "ERR_CREATOR_CANT_LEAVE":
								bot.answerCallbackQuery(msg.id, "Lo sentimos, el creador no puede dejar la partida.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					if (msg == "DELETE_GAME"){
						game.deleteGame(res.msg._id, data[1], function (res){
							//Capturamos errores
							if (res.status == "ERR") {
								switch (res.msg) {
									case "ERR_NO_ACTIVE_GAMES":
										bot.answerCallbackQuery(msg.id, "Esta partida ya está borrada.");
									break;
									case "ERR_CREATOR_DELETE":
										bot.answerCallbackQuery(msg.id, "Solo el creador puede borrar la partida.");
									break;
									default:
										bot.answerCallbackQuery(msg.id, "Error inesperado.");
										console.log(res);
									break;
								}
								return;
							}
							bot.editMessageText("Partida borrada", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
							bot.answerCallbackQuery(msg.id,  "Has abandonado y se ha borrado la partida.");
						});
					} else if (msg == "DELETE_PLAYER_STARTED") {
							//Algunos juegos no permiten esto
					} else if (msg == "DELETE_PLAYER_NOT_STARTED"){
						game.leaveUser(res.msg._id, function (){
							//Capturamos errores
							if (res.status == "ERR") {
								switch (res.msg) {
									default:
										bot.answerCallbackQuery(msg.id, "Error inesperado.");
										console.log(res);
									break;
								}
								return;
							}
							//bot.sendMessage(msg.chat.id, res.username+" ha abandonado la partida.");
						});
					}
				});
			}
		});
	});
	bot.onText(new RegExp("^\\/sendMessage(?:@"+privatedata.botalias+")?\\s(.*)", "i"), function (msg, match) {
		if (msg.chat.type == "private") {
			if (msg.chat.id == privatedata.ownerid) {
				game.db.find('players', {}, function(r_pla) {
					if(r_pla.length){
						for (i=0; i<r_pla.length;i++){
							bot.sendMessage(r_pla[i].user_id, match[1]);
							bot.sendMessage(msg.chat.id, "Mensaje enviado a: "+r_pla[i].username);
						}
					} else bot.sendMessage(msg.chat.id, "No hay usuarios.");
				});
			} else bot.sendMessage(msg.chat.id, "Solo @themarioga puede usar este comando.");
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});
	//Si el comando es /version
	bot.onText(new RegExp("^\/version(?:@"+privatedata.botalias+")?", "i"), function (msg, match) {
		bot.sendMessage(msg.chat.id, "Versión 0.1. Creado por @"+privatedata.owneralias);
	});
	//Si el comando es /create
	bot.onText(new RegExp("^\/create(?:@"+privatedata.botalias+")?$", "i"), function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /help
	bot.onText(new RegExp("^\/help(?:@"+privatedata.botalias+")?$", "i"), function (msg, match) {
		bot.sendMessage(msg.chat.id, 'Bienvenido a la ayuda de '+privatedata.botname+', el bot para telegram.\n'+
		'\n'+
		'Disfrutad del bot y... ¡A jugar!');
	});
});