var Db = require('./db');

//////////CREATE CLASS//////////
var method = Game.prototype;

//////////CONSTRUCTOR//////////
function Game(url, callback) {
	this.db = new Db(url, callback);
	this.minPlayers = 5;
}

//////////AUX METHODS//////////
method.getUsername = function(msg){
	var name = msg.from.first_name;
	if(typeof msg.from.last_name != "undefined") name += " "+msg.from.last_name;
	if(typeof msg.from.username != "undefined") name += " (@"+msg.from.username+")";
	return name
};
method.inArray = function(array, key, value){
	existe = false;
	for (i = 0; i<array.length && !existe; i++){
		if (array[i][key] === value) existe = true;
	}
	return existe;
};
method.shuffleArray = function(array){
    for(var j, x, i = array.length; i; j = Math.floor(Math.random() * i), x = array[--i], array[i] = array[j], array[j] = x);
    return array;
};

//////////GAME//////////
//createUser: data {user_id, username}, callback
method.createUser = function (data, callback){
	var g_object = this;
	//Comprobamos que el usuario no esté dado de alta
	g_object.db.count('players', {user_id: data.user_id}, function (count_player) {
		if (count_player){
			callback({status: "ERR", msg: "ERR_ALREADY_IN_GAME"});
			return;
		}
		//Damos al usuario de alta
		g_object.db.insert('players', data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: res});
		});
	});
};

//getUser: user_id, callback
method.getUser = function (user_id, callback) {
	var g_object = this;
	//Comprobamos si nos envian su ID numerica o alfanumerica
	if (typeof user_id == "number") search = {user_id: user_id};
	else search = {_id: user_id};
	//Buscamos al usuario
	g_object.db.find('players', search, function (array){
		if (!array.length){
			callback({status: "ERR", msg: "ERR_NOT_IN_GAME"});
			return;
		}
		//Comprobamos si ya esta jugando una partida
		g_object.db.count('playersxgame', {player_uid: user_id}, function(count_player){
			if (count_player) callback({status: "OK", msg: array[0], playing: true});
			else callback({status: "OK", msg: array[0], playing: false});
		});
	});
};

//createGame: data {msg_id, room_id, creator_id, n_players, president_id, [more]}, callback
method.createGame = function(data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.count('games', {room_id: data.room_id}, function(count_games) {
		//Si hay partida en este grupo
		if (count_games) {
			callback({status: "ERR", msg: "ERR_ACTIVE_GAME"});
			return;
		}
		//Anadimos el juego a la base de datos
		g_object.db.insert('games', data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: {game_id: res.insertedId}});
		});
	});
};

//joinGame: data {game_id, player_id, player_uid, player_username, [more]}, callback
method.joinGame = function(data, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {_id: g_object.db.getObjectId(data.game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_UNKNOWN_GAME"});
			return;
		}
		//Comprobamos que la partida no esté iniciada
		if (parseInt(r_game[0].president_id)){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.count('playersxgame', {game_id: g_object.db.getObjectId(data.game_id)}, function(count_players){
			//Comprobamos que la sala no este llena
			if (count_players >= r_game[0].n_players){
				callback({status: "ERR", msg: "ERR_ALREADY_FILLED", data: count_players+" >= "+r_game[0].n_players});
				return;
			}
			//Añadimos un contador para el orden
			data.order = count_players+1;
			//Insertamos en la base de datos
			g_object.db.insert('playersxgame', data, function(){
				callback({status: "OK"});
			});
		});
	});
};

//startGame: player_id, game_id, msg_id, callback
method.startGame = function (player_id, game_id, msg_id, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game[0].creator_id.toString() != player_id.toString()){
			callback({status: "ERR", msg: "ERR_NOT_CREATOR_START"});
			return;
		}
		//Comprobamos
		if (parseInt(r_game[0].president_id) != 0){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.find('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			//Comprobamos que la partida este llena
			if (r_players.length != r_game[0].n_players){
				callback({status: "ERR", msg: "ERR_NOT_ENOUGHT_PLAYERS", extra: {current_players: r_players.length, max_players: r_game[0].n_players}});
				return;
			}
			//Iniciamos la partida
			g_object.db.update('games', {_id: g_object.db.getObjectId(game_id)}, {"msg_id": msg_id, "president_id":  parseInt(r_game[0].president_id)+1 }, function () {
				r_game[0].president_id = parseInt(r_game[0].president_id)+1;
				callback({status: "OK", data: {game: r_game[0], players: r_players}});
			});
		});
	});
};

//deleteGame: player_id, game_id, callback
method.deleteGame = function (player_id, game_id, callback) {
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//Comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game[0].creator_id.toString() != player_id.toString()){
			callback({status: "ERR", msg: "ERR_CREATOR_DELETE"});
			return;
		}
		//Borra la partida
		g_object.db.remove('games', {_id: g_object.db.getObjectId(game_id)}, function (){
			g_object.db.remove('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function (){
				callback({status: "OK"});
			});
		});
	});
};

//leaveUser: player_id, callback
method.leaveUser = function (player_id, callback){
	var g_object = this;
	g_object.db.remove('playersxgame', {player_id: g_object.db.getObjectId(player_id)}, function (res){
		if (res.status == "ERR") callback(res);
		else callback({status: "OK"});
	});
};

//leaveGame: player_id, game_id, callback
method.leaveGame = function (player_id, game_id, callback) {
	var g_object = this;
	//Comprobamos que el usuario pertenezca a la partida
	g_object.db.count('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player){
			callback({status: "ERR", msg: "ERR_NO_GAME_PARTICIPANT"});
			return;
		}
		//Comprobamos que la partida no este borrada
		g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
				return;
			}
			//Comprobamos que no sea el creador de la partida
			if (r_game[0].creator_id.toString() == player_id.toString()){
				callback({status: "ERR", msg: "ERR_CREATOR_CANT_LEAVE"});
				return;
			}
			if (r_game[0].president_id != 0){ //Partida iniciada
				//Eres el ultimo, se borra la partida
				if (r_game[0].n_players-1 < this.minPlayers) callback({status: "OK", msg: "DELETE_GAME"});
				//No eres el ultimo
				else callback({status: "OK", msg: "DELETE_PLAYER_STARTED"});
			//Partida sin iniciar
			} else callback({status: "OK", msg: "DELETE_PLAYER_NOT_STARTED"});
		});
	});
};

//Export the game
module.exports = Game;