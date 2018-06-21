var discordAPIKey = 'DISCORD API KEY GOES HERE';
var mongoConnection = 'MONGO CONNECTION STRING GOES HERE';

// ---- uncomment this part to act as a standalone bot ----
// const Discord = require('discord.js');
// const client = new Discord.Client();
// ---------------------------------------------------------

require('datejs');
var nSchedule = require('node-schedule');
var MongoClient = require('mongodb').MongoClient;

// list of channels to be turned into schedules
var schedules = {};

var maxBackups = 9;        // Maximum number of people that can sign up as backup.
var maxCommands = 30;      // Maximum number of commands inside a macro.

var servers = {};
var notifications = {};
var tasks = {};
var deletion = {};
var macros = {};

// List of words that cant be used in names.
var blacklist = {
	"raid": false,
	"create": false,
};

var embedTemplate = {"embed": {
	"color": 16738740,
	"author" : {
		"name" : "",
		"icon_url" : "https://wiki.guildwars2.com/images/1/1f/Spirit_Vale_%28achievements%29.png"
	},
	"fields": []
}};


function macroMaster(message, raids, client) {
	var input = message.content.split(" ");
	switch (input[3]) {
		case "create":
			message.reply(macroCreate(message.author.id, input[4]));
			break;
		case "remove":
			message.reply(macroRemove(message.author.id, input[4]));
			break
		case "list":
			message.reply(macroList(message.author.id));
			break;
		case "info":
			message.reply(macroInfo(message.author.id, input[4]));
			break;
		case "command":
			if (input[4] == "add") {
				message.reply(commandAdd(message.author.id, input[5], input));
			} else if (input[4] == "edit") {
				message.reply(commandAdd(message.author.id, input[5], input, input[6]));
			} else if (input[4] == "remove") {
				message.reply(commandRemove(message.author.id, input[5], input[6]));
			}
			break;
		default:
			message.reply(macroRun(message.author.id, input[3], 0, input.splice(4), message, raids, client));
			reloadSchedule(raids, client);
			break;
	}
}

function macroList(author) {
	if (author in macros) {
		var keys = Object.keys(macros[author]);
		var mx = 0;
		for ( var i = 0; i < keys.length; i++ ) {
			if ( keys[i].length > mx ) {
				mx = keys[i].length;
			}
		}
		var response = "here is a list of your macros : ```\n";
		for ( var i = 0; i < keys.length; i++ ) {	
			response += keys[i];
			for ( var j = 0; j < mx - keys[i].length; j++ ) {
				response += " ";
			}
			response += " - " + macros[author][keys[i]][1].length + " commands & " + macros[author][keys[i]][0] + " variables\n";
		}
		return response + "```";
	} else {
		return "you have no saved macros at the moment."
	}
}

function macroInfo(author, macro) {
	if (!(author in macros)){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	if (!(macro in macros[author])){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	if (macros[author][macro][1].length == 0) {
		return "macro **" + macro + "** is empty.";
	}
	var response = "here is a list of commands in **" + macro + "** macro : ```\n";
	for ( var i = 0; i < macros[author][macro][1].length; i++) {
		response += (i+1).toString();
		for ( var j = 0; j < (macros[author][macro][1].length).toString().length - (i+1).toString().length; j++ ) {
			response += " ";
		}
		response += " > raid " + macros[author][macro][1][i] + "\n";
	}
	return response + "```";
}

function macroCreate(author, macro) {
	if (!(author in macros)){
		macros[author] = {};
	}
	if (macro in macros[author]){
		return "macro named **" + macro + "** already exists, please select a different name.";
	}
	if (macro in blacklist) {
		return "name **" + macro + "** is not available, sorry^^'";
	}
	
	macros[author][macro] = [0, []];
	updateDB("macros");
	return "macro **" + macro + "** created.";
}

function macroRemove(author, macro) {
	if (!(author in macros)){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	if (!(macro in macros[author])){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	delete macros[author][macro];
	updateDB("macros");
	return "macro **" + macro + "** removed.";
}

function commandAdd(author, macro, command, edit = null) {
	var response = "";
	if (!(author in macros)){
		macros[author] = {};
	}
	if (!(macro in macros[author])){
		macros[author][macro] = [0, []];
		response += "macro " + macro + " created, ";
	}
	if (macros[author][macro][1].length == maxCommands) {
		return "maximum macro length reached, sorry ^^'";
	}
	if ( edit != null ) {
		if ( edit == 0 || edit > macros[author][macro][1].length ) {
			return "invalid command selected. Please select a proper command.";
		}
	}
	if ( edit != null ) {
		command = command.splice(7).join(" ");
		macros[author][macro][1][edit - 1] = command;
		macros[author][macro][0] = (macros[author][macro][1].join("")).split("*").length - 1;
		response += "command **'" + edit + "'** edited on **" + macro + "** macro.";
	} else {
		command = command.splice(6).join(" ");
		macros[author][macro][1].push(command);
		macros[author][macro][0] = (macros[author][macro][1].join("")).split("*").length - 1;
		response += "added command **'" + command + "'** to **" + macro + "** macro.";
	}
	updateDB("macros");
	return response;
}

function commandRemove(author, macro, command) {
	if (!(author in macros)){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	if (!(macro in macros[author])){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	if (command == 0 || command > macros[author][macro][1].length) {
		return "invalid command selected. Please select a proper command.";
	}
	macros[author][macro][1].splice(command - 1 ,1);
	updateDB("macros");
	return "command number **" + command + "** removed from macro **" + macro + "**.";
}

function macroRun(author, macro, frequency, params, message, raids, client) {
	params = params.join(" ");
	if (params.indexOf(",") != -1) {
		params = params.split(",");
	} else {
		params = params.split(" ");
	}
	
	if (!(author in macros)){
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	if (!(macro in macros[author])) {
		return "macro **" + macro + "** doesn't exist, sorry ^^'";
	}
	
	if (macros[author][macro][0] == 1) {
		params = [params.join(" ")];
	}
	
	if (params.length != macros[author][macro][0]) {
		return "invalid number of variables.";
	}
	var c = 0;
	var commands = macros[author][macro][1].slice();
	for ( var i = 0; i < params.length; i++ ) {
		while (commands[c].indexOf("*") == -1) {
			c++;
		}
		commands[c] = commands[c].replace("*", params[i]);
	}
	for ( var i = 0; i < commands.length; i++ ) {
		message.content = "<@" + client.user.id + "> raid " + commands[i];
		exports.evalInput(message, raids, client, false);
	}
	return "macro " + macro + " executed.";
}


function reloadSchedule(s, client, init = false) {
	var initSwitch = false;
	updateDB("servers");
	if (s in schedules) {
		var channel = client.guilds.get(s).channels.get(schedules[s]);
		channel.fetchMessages().then(messages => {
			for ( var m = 0; m < messages.array().length; m++ ) {
				if (init && messages.array()[m].author.id == client.user.id && messages.array()[m].embeds.length > 0 && messages.array()[m].embeds[0].author.name == "Raid Schedule - Next Raid") {
					initSwitch = true;
				} else if (!(messages.array()[m].id in deletion)) {
					messages.array()[m].delete();
				}
			}
			if (!(initSwitch)) {
				var schedule = JSON.parse(JSON.stringify(embedTemplate["embed"]));
				schedule["footer"] = {"text": "Start all commands by mentioning the bot. Parameters marked with ? are optional."}
				schedule["author"]["name"] = "Raid Schedule - Next Raid";
				schedule["fields"] = raidInfo(s, servers[s].length);
				schedule["fields"].push({
					"name": "Upcoming Raids",
					"value": listRaids(s)
				});
				schedule["fields"].push({
					"name": "Commands Cheatsheet",
					"value": "**raid join <n?> <role?> **- signs you up for selected raid.\n**raid leave <n?>** - leaves the selected raid.\n**raid notifications <on/off/t> **- notifies you **t** minutes before raid."
				});
				channel.send({"embed" : schedule});
			}
		});
		
	}
}

function updateDB (set) {
	var dbSet = {
		"macros" : macros,
		"notifications" : notifications,
		"servers" : servers
	};
	MongoClient.connect(mongoConnection, function (err, db) {
		db.collection(set, function (err, collection) {
			collection.replaceOne({}, dbSet[set], function(err, doc) {
				if (err) throw err;
			});
		});
	});
};


function help() {
	var help = JSON.parse(JSON.stringify(embedTemplate["embed"]));
	help["author"]["name"] = "Raid Commands";
	help["footer"] = {"text": "Start all commands by mentioning the bot. Parameters marked with ? are optional."}
	help["fields"].push({
		"name": "General Commands",
		"value": "**raid list** - shows scheduled raids.\n**raid info <n?>** - shows details of selected raid.\n**raid join <n?> <role?> **- signs you up for selected raid.\n**raid leave <n?>** - leaves the selected raid.\n**raid role <n?> <role>** - changes role.\n**raid pass <n?>** - moves you to the bottom of backup queue.\n**raid notifications <on/off/t> **- notifies you **t** minutes before raid."
	});
	help["fields"].push({
		"name": "Leader Commands",
		"value": "**raid create <role>, <time>, <name>, <setup?>** - creates a raid.\n**raid edit <n> <setting> <value>** - changes setting to value of selected raid.\n**raid cancel <n?> <reason?>** - cancels selected raid.\n**raid add <name> <n?> <role?>** - adds a person to selected raid.\n**raid kick <name> <n?> **- remove a person from raid."
	});
	help["fields"].push({
		"name": "Macro Commands",
		"value": "**raid macro create <name>** - creates a macro.\n**raid macro remove <name>** - removes selected macro.\n**raid macro list** - lists your macros.\n**raid macro info <name>** - lists commands of selected macro.\n**raid macro command add <name> <command>** - adds new command.\n**raid macro command edit <name> <n> <command>** - edits command number n.\n**raid macro command remove <name> <n>** - removes command number n.\n**raid macro <name> <params>** - executes selected macro."
	});
	return {"embed" : help};
}


function listRaids(s, interval = null) {
	
	if (servers[s].length == 0) {
		return "There are currently no queued raids.";
	} else {
		var maxSize = 5;
		var response = "";
		var range = [0, servers[s].length];
		if ( interval != null ) {
			var patt = /^[0-9]+-[0-9]+$/g;
			if (!(patt.test(interval))) {
				return "Invalid interval, sorry ^^'"
			}
			range = interval.split("-");
			range[0] = parseInt(range[0]);
			range[1] = parseInt(range[1]);
			if (range[0] >= range[1] || range[1] > servers[s].length || range[0] == 0) {
				return "Invalid interval, sorry ^^'"
			}
			range[0]--;
		}
		if ( range[1] - range[0] > maxSize ) {
			range[0] = range[1] - maxSize;
		}
		for (var i = range[0]; i < range[1]; i++) {
			var e = 10;
			for ( var j = 0; j < servers[s][i].roles[0].length; j++ ) {
				if (servers[s][i].roles[1][j] == "") {
					e--;
				}
			}
			response += "`" + parseInt(i+1) + " - " + servers[s][i].time + " - " + servers[s][i].commander + " - " + servers[s][i].name + " (" + e + "/" + servers[s][i].roles[0].length + ")`\n";
		}
		return response;
	}
}

function raidInfo(s, raid) {
	var response = [{"name" : "General Info", "value" : ""}];
	if (servers[s].length == 0) {
		response[0]["value"] = "There are currently no queued raids.";
		return response;
	}
	
	if (raid > servers[s].length || raid == 0) {
		response[0]["value"] = "Selected raid doesn't exist.";
		return response;
	}
	
	response[0]["value"] += "`Name      : " + servers[s][raid-1].name + "`\n";
	response[0]["value"] += "`Number    : " + raid + "`\n";
	response[0]["value"] += "`Commander : " + servers[s][raid-1].commander + "`\n";
	response[0]["value"] += "`Time      : " + servers[s][raid-1].time + "`\n";
	var squad = {"name" : "Squad Info", "value" : "", "inline": true};
	var longest = servers[s][raid-1].roles[0].reduce(function (a, b) { return a.length > b.length ? a : b; });
	for (var i = 0; i < servers[s][raid-1].roles[0].length; i++) {
		squad["value"] += "`" + servers[s][raid-1].roles[0][i];
		for ( var l = 0; l < longest.length - servers[s][raid-1].roles[0][i].length; l++ ) {
			squad["value"] += " ";
		}
		squad["value"] += " - " + servers[s][raid-1].roles[1][i] + "`\n";
	}
	response.push(squad);
	
	if (servers[s][raid-1].backups[0].length > 0) {
		var bus = {"name" : "Backups", "value" : "", "inline": true};
		for (var i = 0; i < servers[s][raid-1].backups[0].length; i++) {
			bus["value"] += "`" + servers[s][raid-1].backups[0][i];
			for ( var l = 0; l < longest.length - servers[s][raid-1].backups[0][i].length; l++ ) {
				bus["value"] += " ";
			}				
			bus["value"] += " - " + servers[s][raid-1].backups[1][i] + "`\n";
		}
		response.push(bus);
	}
	
	return response;
}

function makeRaid(client, s, commander, input) {
	var input = input.slice(3).join(" ").split(",").map(Function.prototype.call, String.prototype.trim);
	var cl = input[0];
	var name = input[2];
	
	var time = input[1];

	var roles = "any";
	if (input.length > 3) {
		roles = input[3];
	}
	
	for (var r = 0; r < servers[s].length; r++) {
		if ( servers[s][r].name == name ) {
			return "raid called **" + name + "** already exists, please select a different name."; 
		}
	}
	
	var valid = 0;
	
	var roleList = [[], ["", "", "", "", "", "", "", "", "", ""]];

	if (roles.indexOf("-") > -1 && roles.indexOf("+") > -1) {
		roles = roles.split("-").map(Function.prototype.call, String.prototype.trim);
		if (roles.length > 2 || roles[0].indexOf("+") > -1) {
			return "invalid group setup."
		}
		roles[1] = roles[1].split("+").map(Function.prototype.call, String.prototype.trim);
	} else {
		roles = [roles];
	}
	
	switch (roles[0]) {
		case "any":
			roleList[0] = ["any", "any", "any", "any", "any", "any", "any", "any", "any", "any"];
			break;
		case "meta":
			roleList[0] = ["Chrono", "Chrono", "PS", "PS", "Druid", "Druid", "DPS", "DPS", "DPS", "DPS"];
			break;
	}
	
	if (roles.length > 1) {
		roleList[0][roleList[0].indexOf(roles[1][0])] = roles[1][1];
	}
	
	for (var i = 0; i < roleList[0].length; i++) {
		if (cl == roleList[0][i].toLowerCase()) {
			roleList[1][i] = commander;
			valid = 1;
			break;
		}
	}
	for (var i = 0; i < roleList[0].length; i++) {
		if ("any" == roleList[0][i].toLowerCase()) {
			roleList[1][i] = commander;
			valid = 1;
			break;
		}
	}
	if (valid == 0) {
		return "sorry, invalid request."
	}
	
	var uid = client.users.find("username", commander).id;
	if ( uid in notifications ) {
		if (!(uid in tasks)) {
			tasks[uid] = {};
		}
		tasks[uid][name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(time)), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
	}

	servers[s].push({commander: commander, time: Date.parse(time).toUTCString(), name: name, roles: roleList, backups: [[], []]});
	return "created **" + name + "** raid by **" + commander + "** scheduled to **" + Date.parse(time).toUTCString() + "**.";
}

function editRaid(client, s, commander, input) {
	var r = parseInt(input[3], 10);

	if (servers[s].length == 0) {
		return "there are currently no queued raids.";
	}
	
	if ( r < 1 || r > servers[s].length ) {
		return "selected raid doesn't exist.";
	}
	
	if ( servers[s][r-1].commander != commander ) {
		return "only " + servers[s][r-1].commander + " can edit this raid, sorry ^^'";
	}
	
	var input = input.slice(4).join(" ").split(",").map(Function.prototype.call, String.prototype.trim);

	var output = "";
	
	for ( var i = 0; i < input.length; i++ ) {
		var tempInput = input[i].split(" ");
		
		if ( tempInput.length < 2 ) {
			return output + "something went wrong, please check if your request is correct. ";
		}
		
		switch (tempInput[0]) {
			case "time":
				var old = servers[s][r-1].time;
				tempInput.shift();
				for ( var p = 0; p < servers[s][r-1]['roles'][1].length; p++ ) {
					if ( servers[s][r-1]['roles'][1][p] != "" ) {
						var uid = client.users.find("username", servers[s][r-1]['roles'][1][p]).id;
						if ( uid in notifications ) {
							if (!(uid in tasks)) {
								tasks[uid] = {};
							}
							if ((servers[s][r-1].name + "-" + s) in tasks[uid] && tasks[uid][servers[s][r-1].name + "-" + s]) {
								tasks[uid][servers[s][r-1].name + "-" + s].cancel();
								delete tasks[uid][servers[s][r-1].name + "-" + s];
							}
							tasks[uid][servers[s][r-1].name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(tempInput.join(" "))), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
						}
					}
				}
				servers[s][r-1].time = Date.parse(tempInput.join(" ")).toUTCString();
				output += "raid time changed from " + old + " to " + servers[s][r-1].time + ". ";
				break;
			case "name":
				var old = servers[s][r-1].name;
				tempInput.shift();
				for (var ra = 0; ra < servers[s].length; ra++) {
					if ( servers[s][ra].name == tempInput.join(" ") ) {
						return "raid called **" + tempInput.join(" ") + "** already exists, please select a different name."; 
					}
				}
				servers[s][r-1].name = tempInput.join(" ");
				output += "raid name changed from " + old + " to " + servers[s][r-1].name + ". ";
				break;
			case "role":
				var sw = false;
				for ( var j = 0; j < servers[s][r-1].roles[0].length; j++ ) {
					if ( servers[s][r-1].roles[0][j].toLowerCase() == tempInput[1].toLowerCase() && servers[s][r-1].roles[1][j] == "") {
						var old = servers[s][r-1].roles[0][j];
						servers[s][r-1].roles[0][j] = tempInput[2];
						output += "role " + old + " changed to " + tempInput[2] + ". ";
						sw = true;
						break;
					}
				}
				if ( sw ) break;
				if ( parseInt(tempInput[1], 10) > 0 && parseInt(tempInput[1], 10) < servers[s][r-1].roles[0].length + 1 ) {
					var old = servers[s][r-1].roles[0][parseInt(tempInput[1], 10) - 1];
					servers[s][r-1].roles[0][parseInt(tempInput[1], 10) - 1] = tempInput[2];
					output += "role " + old + " changed to " + tempInput[2] + ". ";
					break;
				}
				return output + "something went wrong, please check if your request is correct."
			default:
				return output + "something went wrong, please check if your request is correct. "
		}
	}
	return output;
}

function signUp(client, s, raid, name, role, add = null) {
	if (servers[s].length == 0) {
		return "there are currently no queued raids.";
	}
	
	if (raid > servers[s].length || raid == 0) {
		return "selected raid doesn't exist."
	}
	
	var valid = 0;
	var space = 0;
	
	for (var i = 0; i < servers[s][raid-1].roles[1].length; i++) {
		if (servers[s][raid-1].roles[1][i] == name) {
			return "you are already singed up for this raid."
		}
	}
	
	for (var i = 0; i < servers[s][raid-1].backups[1].length; i++) {
		if (servers[s][raid-1].backups[1][i] == name) {
			return "you are already singed up as backup."
		}
	}
		
	if ( add != null && servers[s][raid-1].commander != add ) {
		return "only commander can add people to raid, sorry ^^'";
	}
	
	if ( name == add || name == servers[s][raid-1].commander) {
		return "you are already commanding this raid lol.";
	}
	
	for (var i = 0; i < servers[s][raid-1].roles[0].length; i++) {
		if (role.toLowerCase() == servers[s][raid-1].roles[0][i].toLowerCase()) {
			valid = 1;
			if (servers[s][raid-1].roles[1][i] == "") {
				space = 1;
				servers[s][raid-1].roles[1][i] = name;
				break;
			}
		}
	}
	
	if ( valid == 0 && space == 0 ) {
		for (var i = 0; i < servers[s][raid-1].roles[0].length; i++) {
			if ("any" == servers[s][raid-1].roles[0][i].toLowerCase()) {
				valid = 1;
				if (servers[s][raid-1].roles[1][i] == "") {
					space = 1;
					servers[s][raid-1].roles[1][i] = name;
					break;
				}
			}
		}
	}
	
	if (valid == 0) {
		return "there is currently no space for your role in this raid, sorry.";
	}
	
	if (space == 0) {
		if (servers[s][raid-1].backups[0].length > maxBackups - 1) {
			return "there is currently no space for your role in this raid, sorry.";
		} else {
			servers[s][raid-1].backups[0].push(role);
			servers[s][raid-1].backups[1].push(name);
			return "there is currently no space for your role in this raid, however you were signed up as a backup. Thanks!"
		}
		return 
	}
	
	var uid = client.users.find("username", name).id;
	if ( uid in notifications ) {
		if (!(uid in tasks)) {
			tasks[uid] = {};
		}
		tasks[uid][servers[s][raid-1].name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(servers[s][raid-1].time)), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
	}
	
	return "thank you for signing up for " + servers[s][raid-1].name + ".";
}

function cancelSignUp(client, s, raid, name, kick = null) {
	if (servers[s].length == 0) {
		return "there are currently no queued raids.";
	}
	
	if (raid > servers[s].length || raid == 0) {
		return "selected raid doesn't exist."
	}
	
	var person = "you were";
	if ( kick != null ) {
		if ( kick != servers[s][raid-1].commander) {
			return "only commander can kick people from the raid, sorry ^^'"
		}
		person = name + " was"; 
	}
	
	if ( name == kick ) {
		return "you can't kick yourself lol.";
	}
	
	if ( name == servers[s][raid-1].commander ) {
		return "you can't leave your own raid lol.";
	}
	
	for (var i = 0; i < servers[s][raid-1].roles[0].length; i++) {
		if (servers[s][raid-1].roles[1][i] == name) {
			servers[s][raid-1].roles[1][i] = "";
			var uid = client.users.find("username", name).id;
			if ( uid in notifications && uid in tasks && (servers[s][raid-1].name + "-" + s) in tasks[uid] && tasks[uid][servers[s][raid-1].name + "-" + s]) {
				tasks[uid][servers[s][raid-1].name + "-" + s].cancel();
				delete tasks[uid][servers[s][raid-1].name + "-" + s];
			}
			for (var j = 0; j < servers[s][raid-1].backups[0].length; j++) {
				if (servers[s][raid-1].roles[0][i].toLowerCase() == servers[s][raid-1].backups[0][j].toLowerCase()) {
					servers[s][raid-1].roles[1][i] = servers[s][raid-1].backups[1][j];
					if (servers[s][raid-1].backups[0].length == 1) {
						servers[s][raid-1].backups = [[], []];
					} else {
						servers[s][raid-1].backups[0] = servers[s][raid-1].backups[0].splice(j, 1);
						servers[s][raid-1].backups[1] = servers[s][raid-1].backups[1].splice(j, 1);
					}
					var uid = servers[s][raid-1].roles[1][i];
					if ( uid in notifications ) {
						if (!( uid in tasks )) {
							tasks[uid] = {};
						}
						tasks[uid][servers[s][raid-1].name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(servers[s][raid-1].time)), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
					}
					return person + " removed from the squad for " + servers[s][raid-1].name + ". " + servers[s][raid-1].roles[1][i] + " has taken your spot.";
				}
			}
			return person + " removed from the squad for " + servers[s][raid-1].name + ".";
		}
	}
	for (var i = 0; i < servers[s][raid-1].backups[0].length; i++) {
		if (servers[s][raid-1].backups[1][i] == name) {
			if (servers[s][raid-1].backups[0].length == 1) {
				servers[s][raid-1].backups = [[], []];
			} else {
				servers[s][raid-1].backups[0] = servers[s][raid-1].backups[0].splice(i, 1);
				servers[s][raid-1].backups[1] = servers[s][raid-1].backups[1].splice(i, 1);
			}
			return person + " removed from the backups for " + servers[s][raid-1].name + ".";
		}
	}
	return person + " not signed up for this raid."
}

function changeRole(client, s, raid, name, role) {
	if (servers[s].length == 0) {
		return "there are currently no queued raids.";
	}
	
	if (raid > servers[s].length || raid == 0) {
		return "selected raid doesn't exist."
	}
	
	if ( role.toLowerCase() == "pass" ) {
		if ( name == servers[s][raid-1].commander ) {
			return "commanders can't pass on raid !";
		}
		
		for ( var i = 0; i < servers[s][raid-1].backups[0].length; i++ ) {
			if ( servers[s][raid-1].backups[1][i] == name ) {
				var c = servers[s][raid-1].backups[0][i];
				servers[s][raid-1].backups[1].splice(i, 1);
				servers[s][raid-1].backups[0].splice(i, 1);
				servers[s][raid-1].backups[1].push( name );
				servers[s][raid-1].backups[0].push( c );
				return "you were moved to the bottom of backup queue.";
			}
		}
		for ( var i = 0; i < servers[s][raid-1].roles[0].length; i++ ) {
			if ( servers[s][raid-1].roles[1][i] == name ) {
				var c = servers[s][raid-1].roles[0][i];
				cancelSignUp(client, s, raid, name);
				servers[s][raid-1].backups[1].push( name );
				servers[s][raid-1].backups[0].push( c );
				var uid = client.users.find("username", name).id;
				if ( uid in notifications && uid in tasks && (servers[s][raid-1].name + "-" + s) in tasks[uid] && tasks[uid][servers[s][raid-1].name + "-" + s]) {
					tasks[uid][servers[s][raid-1].name + "-" + s].cancel();
					delete tasks[uid][servers[s][raid-1].name + "-" + s];
				}
				return "you were moved to the bottom of backup queue.";
			}
		}
		return "pass is currently not availible to you.";
	}
	
	var slot1 = null;
	var slot2 = null;
	
	for ( var i = 0; i < servers[s][raid-1].roles[0].length; i++ ) {
		if ( servers[s][raid-1].roles[1][i] == name ) {
			slot1 = i;
		} else if ( servers[s][raid-1].roles[0][i].toLowerCase() == role.toLowerCase() && servers[s][raid-1].roles[1][i] == "") {
			slot2 = i;
		}
		if ( slot1 != null && slot2 != null ) {
			servers[s][raid-1].roles[1][slot1] = "";
			servers[s][raid-1].roles[1][slot2] = name;
			return "your role was changed from " + servers[s][raid-1].roles[0][slot1] + " to " + servers[s][raid-1].roles[0][slot2] + ".";
		}
	}
	
	if ( slot1 == null ) {
		return "you are backup or not signed up for this raid.";
	}
	
	if ( slot2 == null ) {
		return "there is no space for your desired role, sorry ^^'";
	}
}

function cancelRaid(client, s, commander, raid, reason = "Not mentioned.") {
	if (servers[s].length == 0) {
		return "there are currently no queued raids.";
	}
	
	if (raid > servers[s].length || raid == 0) {
		return "selected raid doesn't exist."
	}
	
	if (commander != servers[s][raid-1].commander) {
		return "only commanders can cancel raids."
	}
	for ( var i=0; i < servers[s][raid-1]["roles"][1].length; i++ ) {
		if (servers[s][raid-1]["roles"][1][i] != "") {
			var uid = client.users.find("username", servers[s][raid-1]["roles"][1][i]).id;
			if ( uid in notifications && uid in tasks && (servers[s][raid-1].name + "-" + s) in tasks[uid] && tasks[uid][servers[s][raid-1].name + "-" + s]) {
				tasks[uid][servers[s][raid-1].name + "-" + s].cancel();
				delete tasks[uid][servers[s][raid-1].name + "-" + s];
			}
		}
	}
	var response = "raid **" + servers[s][raid-1].name + "** on **" + servers[s][raid-1].time + "** cancelled by **" + servers[s][raid-1].commander + "**. Reason : **" + reason + "**";
	servers[s].splice(raid-1, 1);
	return response;
}

function toggleNotifications(client, author, toggle = "status") {
	if ( author in notifications ) {
		if ( toggle == "status" || toggle == "on") {
			return "your raid notifications are currently **ON** ( " + notifications[author] + " mins ).";
		} else if (!isNaN(toggle)) {
			notifications[author] = parseInt(toggle, 10);
			for ( var t in tasks[author] ){
				if (tasks[author][t]) {
					tasks[author][t].cancel();
				}
			}
			delete tasks[author];
			for ( var s in servers ) {
				for ( var r = 0; r < servers[s].length; r++ ) {
					for ( var m = 0; m < servers[s][r]["roles"][1].length; m++ ) {
						if (servers[s][r]["roles"][1][m] != "") {
							var uid = client.users.find("username", servers[s][r]["roles"][1][m]).id;
							if ( uid == author ) {
								if (!( uid in tasks )) {
									tasks[uid] = {};
								}
								tasks[uid][servers[s][r].name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(servers[s][r].time)), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
							}
						}
					}
				}
			}
			updateDB("notifications");
			return "your raid notifications were changed to **ON** ( " + toggle + " mins ).";
		} else {
			for ( var t in tasks[author] ){
				if (tasks[author][t]) {
					tasks[author][t].cancel();
				}
			}
			delete tasks[author];
			delete notifications[author];
			updateDB("notifications");
			return "your raid notifications have been turned **OFF**."
		}
	} else {
		if ( toggle == "status" || toggle == "off" ) {
			return "your raid notifications are currently **OFF**.";
		} else if (!isNaN(toggle)) {
			notifications[author] = parseInt(toggle, 10);
			for ( var t in tasks[author] ){
				if (tasks[author][t]) {
					tasks[author][t].cancel();
				}
			}
			delete tasks[author];
			for ( var s in servers ) {
				for ( var r = 0; r < servers[s].length; r++ ) {
					for ( var m = 0; m < servers[s][r]["roles"][1].length; m++ ) {
						if (servers[s][r]["roles"][1][m] != "") {
							var uid = client.users.find("username", servers[s][r]["roles"][1][m]).id;
							if ( uid == author ) {
								if (!( uid in tasks )) {
									tasks[uid] = {};
								}
								tasks[uid][servers[s][r].name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(servers[s][r].time)), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
							}
						}
					}
				}
			}
			updateDB("notifications");
			return "your raid notifications have been turned **ON** ( " + toggle + " mins )."
		} else {
			notifications[author] = 20;
			for ( var s in servers ) {
				for ( var r = 0; r < servers[s].length; r++ ) {
					for ( var m = 0; m < servers[s][r]["roles"][1].length; m++ ) {
						if (servers[s][r]["roles"][1][m] != "") {
							var uid = client.users.find("username", servers[s][r]["roles"][1][m]).id;
							if ( uid == author ) {
								if (!( uid in tasks )) {
									tasks[uid] = {};
								}
								tasks[uid][servers[s][r].name + "-" + s] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(servers[s][r].time)), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
							}
						}
					}
				}
			}
			updateDB("notifications");
			return "your raid notifications have been turned **ON** ( 30 mins )."
		}
	}
}


exports.evalInput = function(message, raids, client, reload = true) {
	message.content = (message.content.split(" ")).filter(function(a){return a !== ''}).join(" ");
	if (reload && ((!(message.author.id == client.user.id && message.embeds.length > 0 && message.embeds[0].author.name == "Raid Schedule - Next Raid")) && message.channel.id == schedules[message.guild.id])) {
		message.delete(3000).then(() => {if (message.id in deletion) {delete deletion[message.id];}});
		deletion[message.id] = 0;
	}
	if (message.content.split(" ")[0] == ("<@" + client.user.id + ">")) {
		var input = message.content.split(" ");
		if (input.length > 2 && input[1] == "raid") {
			switch (input[2]) {
				case "macro":
					if (reload) {
						macroMaster(message, raids, client);
					} else {
						message.reply("macros can't be used in macros.");
					}
					break;
				case "pass":
					if ( input.length > 3 ) {
						message.reply(changeRole(client, raids, input[3], message.author.username, "pass"));
					} else {
						message.reply(changeRole(client, raids, servers[raids].length, message.author.username, "pass"));
					}
					if (reload) reloadSchedule(raids, client);
					break;
				case "role":
					if ( input.length > 4 ) {
						message.reply(changeRole(client, raids, input[3], message.author.username, input[4]));
					} else {
						message.reply(changeRole(client, raids, servers[raids].length, message.author.username, input[4]));
					}
					
					if (reload) reloadSchedule(raids, client);
					break;
				case "edit":
					message.reply(editRaid(client, raids, message.author.username, input));
					if (reload) reloadSchedule(raids, client);
					break;
				case "help":
					message.channel.send(help());
					break;
				case "list":
					var list = JSON.parse(JSON.stringify(embedTemplate["embed"]));
					list["author"]["name"] = "List of Upcoming Raids";
					if ( input.length > 3 ) {
						list["fields"].push({"name" : "Upcoming Raids", "value" : listRaids(raids, input[3])});
					} else {
						list["fields"].push({"name" : "Upcoming Raids", "value" : listRaids(raids)});
					}
					message.channel.send({"embed" : list});
					break;
				case "create":
					message.reply(makeRaid(client, raids, message.author.username, input));
					if (reload) reloadSchedule(raids, client);
					break;
				case "cancel":
					if ( input.length == 3 ) {
						message.reply(cancelRaid(client, raids, message.author.username, servers[raids].length))
					} else if ( input.length > 4 ) {
						message.reply(cancelRaid(client, raids, message.author.username, input[3], input[4]));
					} else {
						if ( isNaN(input[3]) ) {
							message.reply(cancelRaid(client, raids, message.author.username, servers[raids].length, input[3]));
						} else {
							message.reply(cancelRaid(client, raids, message.author.username, input[3]));
						}
					}
					if (reload) reloadSchedule(raids, client);
					break;
				case "add":
					var members = client.guilds.get(raids).members.array();
					for ( var m = 0; m < members.length ; m++ ) {
						if (((input.join(" ")).indexOf(members[m].user.username) != -1) && ((members[m].user.username).split(" ").length > 1)) {
							for (var l = 1; l < (members[m].user.username).split(" ").length ; l++) {
								input[3] += " " + input[3+l];
							}
							input.splice(4, (members[m].user.username).split(" ").length-1);
							break;
						}
					}

					if ( input.length == 4 ) {
						message.reply(signUp(client, raids, servers[raids].length, input[3], "any", message.author.username));
					} else if ( input.length == 5 ) {
						if ( isNaN(input[4]) ) {
							message.reply(signUp(client, raids, servers[raids].length, input[3], input[4], message.author.username));
						} else {
							message.reply(signUp(client, raids, input[4], input[3], "any", message.author.username));
						}
						
					} else {
						message.reply(signUp(client, raids, input[4], input[3], input[5], message.author.username));
					}
					if (reload) reloadSchedule(raids, client);
					break;
				case "kick":
					var members = client.guilds.get(raids).members.array();
					for ( var m = 0; m < members.length ; m++ ) {
						if (((input.join(" ")).indexOf(members[m].user.username) != -1) && ((members[m].user.username).split(" ").length > 1)) {
							for (var l = 1; l < (members[m].user.username).split(" ").length ; l++) {
								input[3] += " " + input[3+l];
							}
							input.splice(4, (members[m].user.username).split(" ").length-1);
							break;
						}
					}
				
					if ( input.length > 4 ) {	
						message.reply(cancelSignUp(client, raids, input[4], input[3], message.author.username));
					} else {
						message.reply(cancelSignUp(client, raids, servers[raids].length, input[3], message.author.username));
					}
					
					if (reload) reloadSchedule(raids, client);
					break;
				case "join":
					if ( input.length == 3 ) {
						message.reply(signUp(client, raids, servers[raids].length, message.author.username, "any"));
					} else if ( input.length == 4 ) {
						if ( isNaN(input[3]) ) {
							message.reply(signUp(client, raids, servers[raids].length, message.author.username, input[3]));
						} else {
							message.reply(signUp(client, raids, input[3], message.author.username, "any"));
						}
						
					} else {
						message.reply(signUp(client, raids, input[3], message.author.username, input[4]));
					}
					if (reload) reloadSchedule(raids, client);
					break;
				case "leave":
					if ( input.length > 3 ) {
						message.reply(cancelSignUp(client, raids, input[3], message.author.username));
					} else {
						message.reply(cancelSignUp(client, raids, servers[raids].length, message.author.username));
					}
					if (reload) reloadSchedule(raids, client);
					break;
				case "info":
					var info = JSON.parse(JSON.stringify(embedTemplate["embed"]));
					info["author"]["name"] = "Raid Information";
					var lent = servers[raids].length;
					if ( input.length > 3 ) {
						lent = input[3];
					}
					info["fields"] = raidInfo(raids, lent);
					message.channel.send({"embed" : info});
					break;
				case "notifications":
				case "notification":
					if ( input.length > 3 ) {
						message.reply(toggleNotifications(client, message.author.id, input[3]));
					} else {
						message.reply(toggleNotifications(client, message.author.id));
					}
					break;
				default:
					message.reply("something went wrong, please check if your request is correct.");
			}
			return true;
		} else {
			return false;
		}
	}
	return true;
}

exports.initialize = function(client, mongoConnection) {
	MongoClient.connect(mongoConnection, function (err, db) {
		db.collection("macros", function (err, collection) {
			collection.findOne({}, function(err, doc) {
				if (err) throw err;
				macros = doc;
				delete macros["_id"];
			});
		});
		db.collection("notifications", function (err, collection) {
			collection.findOne({}, function(err, doc) {
				if (err) throw err;
				notifications = doc;
				delete notifications["_id"];
				
				db.collection("servers", function (err, collection) {
					collection.findOne({}, function(err, doc) {
						if (err) throw err;
						servers = doc;
						delete servers["_id"];
						for ( var s = 0; s < client.guilds.array().length; s++ ) {
							if (!( client.guilds.array()[s].id in servers )) {
								servers[client.guilds.array()[s].id] = [];
							}
							
							for ( var r = 0; r < servers[client.guilds.array()[s].id].length; r++ ) {
								for ( var p = 0; p < servers[client.guilds.array()[s].id][r]["roles"][1].length; p++ ) {
									if (servers[client.guilds.array()[s].id][r]["roles"][1][p] != "") {
										var uid = client.users.find("username", servers[client.guilds.array()[s].id][r]["roles"][1][p]).id;
										if ( uid in notifications ) {
											if (!(uid in tasks)) {
												tasks[uid] = {};
											}
											tasks[uid][servers[client.guilds.array()[s].id][r]["name"] + "-" + client.guilds.array()[s].id] = nSchedule.scheduleJob((notifications[uid]).minutes().ago(Date.parse(servers[client.guilds.array()[s].id][r]["time"])), function(){client.users.get(uid).send("Hey ! Just wanted to let you know that the raid you are signed up for is starting soon ! Good Luck !");}); 
										}
									}
								}
							}
						}
						for ( var s in schedules ) {
							reloadSchedule(s, client, true);
						}
					});
				});
			});
		});
		
	});
}

// ---- uncomment this part to act as a standalone bot ----
client.on('ready', () => {
	exports.initialize(client, mongoConnection);
	console.log("I'm ready!");
});

client.on('message', message => {
	exports.evalInput(message, message.channel.guild.id, client);
});

client.login(discordAPIKey);
// ---------------------------------------------------------
