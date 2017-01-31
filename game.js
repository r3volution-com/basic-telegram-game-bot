//ToDo: Al consultar la BD usar el callback de 2 parametros (err, response) para propagar errores y usar el metodo del return; para capturarlos
//ToDo: Donde entra por parametro r_game hay que limitar la informacion que recibe a solo la que va a usar
var Db = require('./db');

//////////AUX FUNCTIONS//////////
function inArray(array, key, value){
	existe = false;
	for (i = 0; i<array.length && !existe; i++){
		if (array[i][key] === value) existe = true;
	}
	return existe;
}
function shuffleArray(array){
    for(var j, x, i = array.length; i; j = Math.floor(Math.random() * i), x = array[--i], array[i] = array[j], array[j] = x);
    return array;
};

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
}

//////////GAME//////////
//createUser: data {user_id, username}, callback
method.createUser = function (data, callback){
	var g_object = this;
	g_object.db.count('players', {user_id: data.user_id}, function (count_player) {
		if (count_player){
			callback({status: "ERR", msg: "ERR_ALREADY_IN_GAME"});
			return;
		}
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
	g_object.db.find('players', {user_id: user_id}, function (array){
		if (!array.length){
			callback({status: "ERR", msg: "ERR_NOT_IN_GAME"});
			return;
		}
		g_object.db.count('playersxgame', {player_uid: user_id}, function(count_player){
			if (count_player) callback({status: "OK", msg: array[0], playing: true});
			else callback({status: "OK", msg: array[0], playing: false});
		});
	});
};

//leaveUser: player_id, callback
method.leaveUser = function (player_id, callback){
	game.db.remove('playersxgame', {player_id: g_object.db.getObjectId(player_id)}, function (res){
		if (res.status == "ERR") callback(res);
		else callback({status: "OK"});
	});
};

//createGame: data {from_id, type, n_players, n_cardstowin, dictionary}, callback
method.createGame = function(data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.count('games', {room_id: data.room_id}, function(count_games) {
		//Si hay partida en este grupo
		if (count_games) {
			callback({status: "ERR", msg: "ERR_ACTIVE_GAME"});
			return;
		}
		g_object.db.insert('games', data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			//ToDo: Preparar tabla 'leyes' con un array random de leyes
			callback({status: "OK", msg: {game_id: res.insertedId}});
		});
	});
};

//joinGame: data {data.game_id, data.user_id, data.username}, callback
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
		g_object.db.count('playersxgame', {game_id: r_game[0].game_id}, function(count_players){
			//Comprobamos que la sala no este llena
			if (count_players >= r_game[0].n_players){
				callback({status: "ERR", msg: "ERR_ALREADY_FILLED", data: count_players+" >= "+r_game[0].n_players});
				return;
			}
			//Añadimos un contador para el orden
			data.order = count_players+1;
			//Insertamos en la base de datos
			g_object.db.insert('playersxgame', data, function(){
				callback({status: "OK", data: {game_id: r_game[0].game_id}});
			});
		});
	});
};

//startGame: player_id, game_id, callback
method.startGame = function (player_id, game_id, callback){
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
			callback({status: "ERR", msg: "ERR_NOT_CREATOR_START", extra: {creator_name: r_game[0].creator_name}});
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
			callback({status: "OK", data: {game: r_game[0], players: r_players}});
		});
	});
};

//deleteGame: game_id, player_id, game_id, callback
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

//ToDo: revisar
method.leaveGame = function (player_id, callback) {
	var g_object = this;
	g_object.db.find('playersxgame', {player_id: g_object.db.getObjectId(player_id)}, function(r_player){
		if (!r_player.length){
			callback({status: "ERR", msg: "ERR_NO_GAME_PARTICIPANT"});
			return;
		}
		g_object.db.find('games', {game_id: g_object.db.getObjectId(r_player[0].game_id)}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
				return;
			}
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