const os = require("os");

console.log(os.hostname());

const http = require("http");
const WebSocket = require("ws");
//allow cors
const cors = require("cors");
const express = require("express");
const app = express();
app.use(cors());
const axios = require("axios");
const server = http.createServer(app);
//res.end
app.get("/", (req, res) => {
  res.end("I am your friendly Rocket Networking server!");
});
const wss = new WebSocket.Server({ server });

//ADMIN STUFF
var firebase = require("firebase");

// Initialize the app with a service account, granting admin privileges
firebase.initializeApp({
  //: admin.credential.cert(serviceAccount),
  // The database URL depends on the location of the database
  databaseURL: "https://rocket-networking-default-rtdb.firebaseio.com",
});
const { NodeVM } = require("vm2");

// As an admin, the app has access to read and write all data, regardless of Security Rules
var db = firebase.database();

/*
 * Takes in uuid and returns the JSON associated with it on firebase
 */
async function getServerInfo(uuid) {
  var ref = db.ref("users/" + uuid);
  var finalValue = -1;
  // Attach an asynchronous callback to read the data at our posts reference
  await ref.once(
    "value",
    (snapshot) => {
      finalValue = snapshot.val();
    },
    (errorObject) => {
      console.info("The read failed: " + errorObject.name);
    }
  );
  if (!finalValue) {
    finalValue = -1;
  }
  console.info("getserverinfo function has returned a value");

  return finalValue;
}

/*
 * Update server info
 */

function UpdateServerInfoOnFirebase(providedUid) {
  setServerInfo(providedUid, "/activity", getServerActivity(providedUid));
}
//keep calling every 20 sec
setInterval(() => {
  for (let serverKey in servers) {
    UpdateServerInfoOnFirebase(serverKey);
  }
}, 20 * 1000);

// Cleans up unused rooms and clients
function CleanRoomsAndClients() {
  for (let serverKey in servers) {
    servers[serverKey].RoomsCleanup();
    for (let gameId in servers[serverKey].games) {
      servers[serverKey].games[gameId].RoomsCleanup();
    }
  }

  setTimeout(CleanRoomsAndClients, 1000 / 60);
}

CleanRoomsAndClients();

/*
 * send an alert to client
 */
function sendAlertToClient(ws, type, message) {
  var stringToSend = {
    eventName: "alert",
    type: type, //show alerts are shown
    message: message,
  };
  if (ws.useCiphering) {
    ws.send(substitutionEncrypt(JSON.stringify(stringToSend), ws.uuid));
  } else {
    ws.send(JSON.stringify(stringToSend));
  }
}

/*
 *send event to client
 *
 */
function sendEventToClient(eventObject, ws) {
  if (ws.useCiphering) {
    ws.send(substitutionEncrypt(JSON.stringify(eventObject), ws.uuid));
  } else {
    ws.send(JSON.stringify(eventObject));
  }
}

/*
 *Update Server info on Firebase
 *
 */
function setServerInfo(uuid, pathAfterUUID, value) {
  var ref = db.ref("users");
  ref.child(uuid).child(pathAfterUUID).set(value);
}

/*
 * Get all Activity
 */
function getServerActivity(uuid) {
  var activity = {
    games: {},
  };

  if (uuid in servers) {
    for (let gameId in servers[uuid].games) {
      activity.games[gameId] = {
        rooms: {},
      };

      for (let roomKey in servers[uuid].games[gameId].rooms) {
        activity.games[gameId].rooms[roomKey] = {
          clients: {},
          persistentObjects: Object.keys(
            servers[uuid].games[gameId].rooms[roomKey].persistentObjects
          ),
        };

        // update clients
        for (let clientKey in servers[uuid].games[gameId].rooms[roomKey]
          .clients) {
          activity.games[gameId].rooms[roomKey].clients[clientKey] = {
            entities: Object.keys(
              servers[uuid].games[gameId].rooms[roomKey].clients[clientKey]
                .entities
            ),
            afk:
              Date.now() -
              servers[uuid].games[gameId].rooms[roomKey].clients[clientKey]
                .lastPingAt,
          };
        }
      }
    }
    // activity is updated fully
  }

  return activity;
}

// Substitution Cipher Encryption
function substitutionEncrypt(message, key) {
  let encryptedMessage = "";
  for (let i = 0; i < message.length; i++) {
    let char = message.charAt(i);
    let keyIndex = key.charCodeAt(i % key.length);
    let encryptedChar = String.fromCharCode(char.charCodeAt(0) + keyIndex);
    encryptedMessage += encryptedChar;
  }
  return encryptedMessage;
}

// Substitution Cipher Decryption
function substitutionDecrypt(encryptedMessage, key) {
  let decryptedMessage = "";
  for (let i = 0; i < encryptedMessage.length; i++) {
    let char = encryptedMessage.charAt(i);
    let keyIndex = key.charCodeAt(i % key.length);
    let decryptedChar = String.fromCharCode(char.charCodeAt(0) - keyIndex);
    decryptedMessage += decryptedChar;
  }
  return decryptedMessage;
}

const crypto = require("crypto");

function md5Hash(str) {
  const hash = crypto.createHash("md5");
  hash.update(str, "utf8");
  return hash.digest("hex");
}

async function hashToUUIDfromFirebase(hash) {
  console.log("the hash is " + hash);
  try {
    // Check if the hash exists in hashedServerIds
    const hashedSnapshot = await db
      .ref("/hashedServerIds/" + hash)
      .once("value");

    if (hashedSnapshot.exists()) {
      // Hash found in hashedServerIds, return the corresponding UUID
      const uuid = hashedSnapshot.val();
      console.info("used the server id instead of uuid");
      return uuid;
    } else {
      // Hash not found in hashedServerIds, try deciphering in the crypto node
      const cryptoSnapshot = await db.ref("/crypto/" + hash).once("value");
      console.info("got the uuid in crypto");

      if (cryptoSnapshot.exists()) {
        // The hash exists in the database, return the corresponding UUID
        const uuid = cryptoSnapshot.val();
        return uuid;
      } else {
        // Hash not found in crypto node
        return null;
      }
    }
  } catch (error) {
    console.error("Error retrieving UUID from Firebase:", error.message);
    throw error;
  }
}

const PUREST_SERVER_SIDE_CODE = `
// Room iteration

for (let gameId in server.games){

switch(gameId){
  case "default":
  const game = server.games[gameId]
  for (let roomId in game.rooms) {
    const room = game.rooms[roomId];

 
    
    // Room-specific code here
    
    // Client iteration
    for (let clientId in room.clients) {
      const client = room.clients[clientId];
      
      // Client-specific code here

      //
      for(let entityId in client.entities){
        try{
          var EP = JSON.parse(client.entities[entityId])
          
        // Entities-specific code here
          
        }catch(e){
          console.log(e)
        }

      }

      //console.log("found client " + clientId + " in room " + roomId);
 
    }
  }
  break;

  //add more cases here for other games you have
}
}

`;

//counters
var clientId = 0;
var roomId = 0;
var serverId = 0;
var persistentObjectId = 1;

//object for servers
var servers = {};

class Server {
  constructor(serverId, maxClients) {
    this.serverId = serverId;
    this.maxClients = maxClients;
    this.frameRate = 60; // Default frame rate is 60 fps
    this.games = {}; // Dictionary to store Game instances

    this.stateUpdate();
  }

  addGame(gameId) {
    const game = new Game(gameId, this.serverId);
    this.games[gameId] = game;
  }

  addRoom(gameId, room) {
    room.serverId = this.serverId;
    this.games[gameId].addRoom(room);
  }

  NumberOfClientsOnthisServer() {
    let count = 0;
    for (let gameId in this.games) {
      count += this.games[gameId].NumberOfClientsInGame();
    }
    return count;
  }

  RoomsCleanup() {
    for (let gameId in this.games) {
      this.games[gameId].RoomsCleanup();
    }
  }

  getClientsInArray() {
    let cArr = [];
    for (let gameId in this.games) {
      cArr = cArr.concat(this.games[gameId].getClientsInArray());
    }
    return cArr;
  }

  stateUpdate() {
    // Your state update logic goes here
    for (let gameId in this.games) {
      this.games[gameId].stateUpdate();
    }

    // Use this.frameRate for the frame rate of this server
    setTimeout(() => this.stateUpdate(), 1000 / this.frameRate);
  }
}

class Game {
  constructor(gameId, serverId) {
    this.gameId = gameId;
    this.serverId = serverId;
    this.rooms = {};
    // Create a new VM instance
    this.vm = new NodeVM({
      console: "redirect",
      require: {
        external: ["request"],
      },
      timeout: 16, // Set a time limit for code execution (in milliseconds)
      sandbox: {
        game: this,
      }, // Provide an empty object as the sandbox (for the code to run in)
    });
    this.vm.on("console.log", (data) => {
      console.log(`Server Side Code: ${data}`);
    });
    this.serverSideCode = {
      step: "",
    };
    //get the server side code from firebase rtdb/users/serverId/serverSideScripting/gameId

    const SSCref = db.ref(
      "users/" + serverId + "/serverSideScripts/" + this.gameId
    );

    // Attach an asynchronous callback to read the data at our posts reference
    SSCref.once(
      "value",
      (snapshot) => {
        if (snapshot.exists()) {
          this.serverSideCode = snapshot.val();
          console.log(this.serverSideCode);
        } else {
        }
      },
      (errorObject) => {
        console.info("Getting server side script failed! " + errorObject.name);
      }
    );
  }

  addRoom(room) {
    room.serverId = this.serverId;
    this.rooms[room.roomId] = room;
  }

  NumberOfClientsInGame() {
    let count = 0;
    for (let key in this.rooms) {
      count += Object.keys(this.rooms[key].clients).length;
    }
    return count;
  }

  RoomsCleanup() {
    for (let key in this.rooms) {
      this.rooms[key].clientsCleanup();
      if (
        Object.keys(this.rooms[key].clients).length == 0 &&
        Object.keys(this.rooms[key].persistentObjects).length == 0
      ) {
        delete this.rooms[key];
      }
    }
  }

  getClientsInArray() {
    let cArr = [];
    for (let roomKey in this.rooms) {
      cArr = cArr.concat(this.rooms[roomKey].getClientsInArray());
    }
    return cArr;
  }

  stateUpdate() {
    // Server side logic code
    try {
      // Capture the console output of the sandboxed code

      const stepCode = this.serverSideCode.step.deployedCode;
      if (stepCode) {
        const result = this.vm.run(stepCode);
      }
    } catch (error) {
      console.error("Error during execution of server step:", error);
    }
    // Your state update logic goes here
    for (let roomKey in this.rooms) {
      for (let clientKey in this.rooms[roomKey].clients) {
        var entities = this.rooms[roomKey].clients[clientKey].entities;
        var serverEntities = {};
        var oldEntities = {};
        for (let entityId in entities) {
          oldEntities[entityId] = entities[entityId].EPstring;
          serverEntities[entityId] = entities[entityId].EPSstring;
        }

        var stringToSend = {
          eventName: "state_update",
          clientId: parseInt(clientKey),
          roomId: roomKey,
          afk: Date.now() - this.rooms[roomKey].clients[clientKey].lastPingAt,
          SP: this.rooms[roomKey].clients[clientKey].sharedProperties,
          SPS: this.rooms[roomKey].clients[clientKey]
            .sharedPropertiesFromServer,
          entities: JSON.stringify(oldEntities),
          entitiesOnServer: JSON.stringify(serverEntities),
        };

        if (
          !stringToSend.SP ||
          this.rooms[roomKey].clients[clientKey].socket.isClosed
        ) {
          continue; // Skip sending updates for dead players or players with missing shared properties
        }

        // send to other players
        for (let otherClientKey in this.rooms[roomKey].clients) {
          sendEventToClient(
            stringToSend,
            this.rooms[roomKey].clients[otherClientKey].socket
          );
        }
      }
    }
  }

  handleEventToServer(senderClientId, eventName, messageStruct) {
    const vm = new NodeVM({
      timeout: 1000, // Set a time limit for code execution (in milliseconds)
      console: "redirect",
      require: {
        external: ["request"],
      },
      sandbox: {
        senderClientId: senderClientId,
        eventName: eventName,
        messageStruct: messageStruct,
        server: servers[this.serverId],
        game: this,
      },
    });
    vm.on("console.log", (data) => {
      console.log(`Server Side Code: ${data}`);
    });

    // Server side logic code
    try {
      // Capture the console output of the sandboxed code

      const client_sent_event_code =
        this.serverSideCode.client_sent_event.deployedCode;

      if (client_sent_event_code) {
        const result = vm.run(client_sent_event_code);
      }
    } catch (error) {
      console.error("Error during execution of handle event to server:", error);
    }
  }

  SendEventToClientFromServer(RclientId, eventName, messageStruct) {
    for (let roomId in this.rooms) {
      for (let clientId in this.rooms[roomId].clients) {
        if (RclientId == clientId) {
          console.log("Sending E from server now...");
          console.log({
            eventName: "SEFC",
            event: eventName,
            message: JSON.stringify(messageStruct),
          });
          sendEventToClient(
            {
              eventName: "SEFC",
              event: eventName,
              message: JSON.stringify(messageStruct),
            },
            this.rooms[roomId].clients[clientId].socket
          );
        }
      }
    }
  }
}

class Room {
  constructor(roomId) {
    // the main constructor
    this.roomId = roomId;
  }
  serverId = -111111; // the server id that this room belongs to

  clients = {}; // an empty dictionary, all clients can go here

  persistentObjects = {}; // an empty dictionary, all persistent objects can go here

  addClient(client) {
    client.roomId = this.roomId;
    this.clients[client.clientId] = client;
  }

  clientsCleanup() {
    var thisServerId = this.serverId;

    try {
      for (var key in this.clients) {
        if (this.clients[key].socket.isClosed) {
          delete this.clients[key];

          // tell others in this room that this guy is gone
          for (var clientKey in this.clients) {
            sendEventToClient(
              {
                eventName: "destroy_player",
                clientId: parseInt(key),
              },
              this.clients[clientKey].socket
            );
          }
          // revise pseudohost
          this.revisePseudoHost();
        }
      }
    } catch (e) {
      console.log(e);
    }
  }

  getClientsInArray() {
    this.clientsCleanup();
    var cArr = Object.keys(this.clients);
    return cArr;
  }

  revisePseudoHost() {
    if (Object.keys(this.clients).length === 0) {
      return;
    }

    var earliestTime = Infinity;
    var earliestClientKey = null; // Use null instead of 0

    // Find the earliest joined time and the corresponding client key
    for (let clientKey in this.clients) {
      const client = this.clients[clientKey];
      if (client.joinedAt < earliestTime) {
        earliestTime = client.joinedAt;
        earliestClientKey = clientKey;
      }
    }

    // Set the found client as the pseudo host
    const previousPseudoHostKey = this.getPseudoHostKey();
    for (let clientKey in this.clients) {
      const client = this.clients[clientKey];
      client.isPseudoHost = clientKey === earliestClientKey;
    }

    // Check if the pseudo host has changed
    const currentPseudoHostKey = this.getPseudoHostKey();
    if (previousPseudoHostKey !== currentPseudoHostKey) {
      // Send an update to all clients in this room
      for (let clientKey in this.clients) {
        sendEventToClient(
          {
            eventName: "pseudoHost",
            pH: currentPseudoHostKey,
          },
          this.clients[clientKey].socket
        );
        console.log(
          "Setting the pseudohost of the room " +
            this.roomId +
            " to " +
            currentPseudoHostKey,
          this.serverId
        );
      }
    }
  }

  getPseudoHostKey() {
    let foundPseudoHostKey = null;

    for (let clientKey in this.clients) {
      const client = this.clients[clientKey];
      if (client.isPseudoHost) {
        if (foundPseudoHostKey !== null) {
          // Another client already found with isPseudoHost = true
          return null;
        }
        foundPseudoHostKey = clientKey;
      }
    }

    return foundPseudoHostKey;
  }
}

class Client {
  constructor(ws) {
    this.socket = ws;
  }
  roomId = -167; // the room that this belongs to
  clientId = ++clientId;

  sharedProperties = JSON.stringify({});
  sharedPropertiesFromServer = JSON.stringify({});
  isPseudoHost = false;
  lastPingAt = Date.now();

  entities = {};

  getSP() {
    try {
      return JSON.parse(this.sharedProperties);
    } catch (e) {
      return null;
    }
  }
  setSP(sharedPropertiesDict) {
    try {
      this.sharedProperties = JSON.stringify(sharedPropertiesDict);
    } catch (e) {}
  }

  getSPfromServer() {
    try {
      return JSON.parse(this.sharedPropertiesFromServer);
    } catch (e) {
      return null;
    }
  }
  setSPfromServer(sharedPropertiesFromServerDict) {
    try {
      this.sharedPropertiesFromServer = JSON.stringify(
        sharedPropertiesFromServerDict
      );
    } catch (e) {
      console.log(e, this.socket);
    }
  }
}
class Entity {
  constructor(submittedEntityPropertiesString) {
    this.EPstring = submittedEntityPropertiesString;
    this.EPSstring = JSON.stringify({});
  }

  getEP() {
    try {
      return JSON.parse(this.EPstring);
    } catch (e) {
      return null;
    }
  }
  setEP(entitySharedPropertiesDict) {
    try {
      this.EPstring = JSON.stringify(entitySharedPropertiesDict);
    } catch (e) {}
  }

  getEPfromServer() {
    try {
      return JSON.parse(this.EPSstring);
    } catch (e) {
      return null;
    }
  }
  setEPfromServer(entitySharedPropertiesFromServerDict) {
    try {
      this.EPSstring = JSON.stringify(entitySharedPropertiesFromServerDict);
    } catch (e) {}
  }
}
class PersistentObject {
  constructor(sharedProperties, roomRef) {
    this.persistentObjectId = persistentObjectId++;
    this.sharedProperties = sharedProperties;
    this.roomRef = roomRef;

    this.roomRef.persistentObjects[this.persistentObjectId] = this;

    //tell everyone in this room that there is a new persistent object
    for (var clientKey in this.roomRef.clients) {
      sendEventToClient(
        {
          eventName: "pO_update",
          POid: this.persistentObjectId,
          pOp: this.sharedProperties,
          roomId: this.roomRef.roomId,
        },
        this.roomRef.clients[clientKey].socket
      );
    }
  }

  getProperties() {
    try {
      return JSON.parse(this.sharedProperties);
    } catch (e) {}
  }
  editProperties(newPropertyDict) {
    this.sharedProperties = JSON.stringify(newPropertyDict);
    //tell everyone in this room that this po is edited
    for (var clientKey in this.roomRef.clients) {
      sendEventToClient(
        {
          eventName: "pO_update",
          POid: this.persistentObjectId,
          pOp: this.sharedProperties,
          roomId: this.roomRef.roomId,
        },
        this.roomRef.clients[clientKey].socket
      );
    }
  }

  destroy() {
    //remove this object ref from room
    delete this.roomRef.persistentObjects[this.persistentObjectId];

    //tell everyone in this room that this po is deleted
    for (var clientKey in this.roomRef.clients) {
      sendEventToClient(
        {
          eventName: "destroy_pO",
          POid: this.persistentObjectId,
        },
        this.roomRef.clients[clientKey].socket
      );
    }
  }
}

// Function to override console.log
function customLog(log, serverId = "default") {
  // Original console.log behavior
  console.info(log);

  // Send the log message to the WebSocket server associated with the serverId

  var streamerWs = servers[serverId]?.streamer;
  if (streamerWs) {
    if (streamerWs.readyState === WebSocket.OPEN) {
      console.info("Sending log to streamer");
      var stringToSend = {
        eventName: "log",
        log: JSON.stringify(log),
      };
      streamerWs.send(JSON.stringify(stringToSend));
    } else {
      streamerWs = null;
    }
  }
}
console.log = customLog;

wss.on("connection", (ws) => {
  //stuff we want to happen after player connects goes down here
  console.log("someone connected");

  ws.isClosed = false;

  //when the client sends us a message
  ws.on("message", async (data) => {
    data = data.toString();

    try {
      if (data.length > 10000) {
        return;
      }
    } catch (e) {
      return;
    }

    if (data.includes("eventName")) {
      //pass through, this is for older games
    } else {
      ///we have to decrypt it
      var secretKey = ws.uuid;
      if (secretKey) {
        data = substitutionDecrypt(data, secretKey);
      } else {
        console.log("ERROR IN MESSAGE RECEIVED!");
        console.log(data);
      }
    }

    try {
      JSON.parse(data);
    } catch (e) {
      return;
    }
    var realData = JSON.parse(data);

    //streamers
    if (realData.eventName == "streamer") {
      console.log(realData);
      var submittedServerId = realData.uuid;
      if (submittedServerId in servers) {
        servers[submittedServerId].streamer = ws;
        console.info("Adding streamer to server");
        ws.uuid = submittedServerId;
        var stringToSend = {
          eventName: "init_metadata",
          fps: servers[submittedServerId].frameRate,
        };
        ws.send(JSON.stringify(stringToSend));
      } else {
        var stringToSend = {
          eventName: "alert",
          message:
            "The server has not been initiated yet, please play your game, then refresh this page and you can see logs!",
        };
        ws.send(JSON.stringify(stringToSend));
      }
    }
    if (realData.eventName == "streamer_set_fps") {
      var fps = Math.floor(realData.fps);
      if (typeof fps == "number" && fps > 1 && fps < 61) {
        if (ws.uuid in servers) {
          servers[ws.uuid].frameRate = fps;
          var stringToSend = {
            eventName: "set_fps",
            message:
              "The server's state update freq. has succesfully been changed to " +
              fps +
              " per second",
          };
          console.log(
            "The server's state update freq. has succesfully been changed to " +
              fps +
              " per second",
            ws.uuid
          );
          ws.send(JSON.stringify(stringToSend));
        }
      }
    }
    if (realData.eventName == "streamer_deploy_ssc") {
      console.log(realData);
      const gameName = realData.game;
      const scriptName = realData.script;

      if (
        typeof realData.ssc == "string" &&
        typeof ws.uuid == "string" &&
        typeof gameName == "string" &&
        typeof scriptName == "string"
      ) {
        try {
          servers[ws.uuid].games[gameName].serverSideCode[
            scriptName
          ].deployedCode = realData.ssc;
          var stringToSend = {
            eventName: "set_ssc",
          };
          console.log(
            "The server's Server Side code has been updated ",
            ws.uuid
          );
          console.log(servers[ws.uuid].games[gameName].serverSideCode);
          ws.send(JSON.stringify(stringToSend));
        } catch (e) {
          console.log(e);
        }
      }
    }

    if (realData.eventName != "state_update") {
      // console.log(realData);
    }

    switch (realData.eventName) {
      case "join_server":
        // VALIDATIONS

        if (!realData.gameId) {
          realData.gameId = "default";
        }

        if (typeof realData.serverId != "string") {
          break;
        } else {
          if (realData.serverId.length > 100) {
            break;
          }
        }
        if (typeof realData.gameId != "string") {
          break;
        } else {
          if (realData.gameId.length > 100) {
            break;
          }
        }

        var useCiphering = realData.uC;
        var version = realData.v;
        if (typeof useCiphering == "boolean") {
          ws.useCiphering = useCiphering;
        } else {
          ws.useCiphering = false;
        }
        if (typeof version == "number") {
          ws.version = version;
        } else {
          ws.version = 1;
        }
        // check if this is a real uid/serverid or not
        const hashOfUUID = realData.serverId;
        let providedUid = "";
        console.log(hashOfUUID);
        if (realData.serverId.length == 32) {
          console.log("length is");
          console.log(realData.serverId.length);
          // this is a hash
          providedUid = await hashToUUIDfromFirebase(hashOfUUID);
          // attach the uuid to the websocket
          ws.uuid = providedUid;
          //attach gameid too
          ws.gameId = realData.gameId;
        } else {
          // this is not hashed
          ws.uuid = realData.serverId;
          providedUid = ws.uuid;
          //attach gameid
          ws.gameId = realData.gameId;
        }
        console.log("Someone wants to join your server", ws.uuid);
        var serverInfo = await getServerInfo(ws.uuid);
        console.log(" the current serverInfo is", ws.uuid);
        console.log(serverInfo, ws.uuid);

        if (serverInfo != -1) {
          // the provided uid is real
          // check if this server is already there in servers dict
          if (providedUid in servers) {
            // this server is already running
            servers[providedUid].maxClients = serverInfo.maxClients; // update maxclients everytime someone joins

            // CHECK HOW MANY CLIENTS ARE THERE HERE !!!! ONLY if less than maxclients you can allow
            if (
              servers[providedUid].NumberOfClientsOnthisServer() <
              serverInfo.maxClients
            ) {
              console.log(
                "Number of clients on this server before adding this new guy is",
                ws.uuid
              );
              console.log(
                servers[providedUid].NumberOfClientsOnthisServer(),
                ws.uuid
              );

              var client = new Client(ws); // create client
              var room = new Room(client.clientId); // make personal room for client
              room.addClient(client); // add client here

              // Check if the server has a specific game, if not, create a new game
              var gameId = realData.gameId;
              if (!(gameId in servers[providedUid].games)) {
                servers[providedUid].addGame(gameId);
              }

              servers[providedUid].addRoom(gameId, room); // add room to server

              // Tell this client we created you
              sendEventToClient(
                {
                  eventName: "created_you",
                  clientId: client.clientId,
                },
                ws
              );
            } else {
              if (serverInfo.maxClients == 0) {
                console.log("SERVER is not allowed to have players!", ws.uuid);
                sendAlertToClient(
                  ws,
                  "show",
                  " Your free trial is over! Please support us by upgrading your plan."
                );
              } else {
                console.log("SERVER HAS REACHED MAX CAPACITY", ws.uuid);
                sendAlertToClient(
                  ws,
                  "show",
                  " Your Server has reached maximum client capacity! Please upgrade your plan."
                );
              }
            }
          } else {
            console.log("Creating new server on nodejs.", ws.uuid);
            // this server needs to be just started

            var newServer = new Server(providedUid, serverInfo.maxClients);
            servers[providedUid] = newServer;

            var client = new Client(ws); // create client
            var room = new Room(client.clientId); // make personal room for client
            room.addClient(client); // add client here

            //Update server side code

            try {
              newServer.serverSideCode =
                serverInfo.serverSideScripts.code || "";
            } catch (e) {
              newServer.serverSideCode = PUREST_SERVER_SIDE_CODE;
            }

            // Check if the server has a specific game, if not, create a new game
            var gameId = realData.gameId || "default";
            if (!(gameId in servers[providedUid].games)) {
              servers[providedUid].addGame(gameId);
            }

            servers[providedUid].addRoom(gameId, room); // add room to server

            // Tell this client we created you
            sendEventToClient(
              {
                eventName: "created_you",
                clientId: client.clientId,
              },
              ws
            );
          }

          setServerInfo(
            providedUid,
            "/activity",
            getServerActivity(providedUid)
          );
        } else {
          // invalid uid
          console.log("INVALID USER ID", ws.uuid);
          sendAlertToClient(
            ws,
            "show",
            "Invalid Server ID. Please make sure this is your Server ID shown on the website! "
          );
        }

        // console.log(servers);

        break;

      case "change_room":
        // linked the gameId of every websocket to ws.gameId, so use that and don't need to validate it because it was already validated at first
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedRoomId = realData.roomId;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedRoomId &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedRoomId == "string" &&
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            console.log(
              "Got a Room Change Request. from" +
                submittedClientId +
                "Room Change validation done",
              ws.uuid
            );
            // All validations done
            if (submittedRoomId.trim().length == 0) {
              break;
            }

            // good letters check
            var goodLetters = true;
            for (let letter in submittedRoomId) {
              var allowedLetters =
                "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890_";
              if (!allowedLetters.includes(submittedRoomId[letter])) {
                goodLetters = false;
                break;
              }
            }

            if (!goodLetters) {
              break;
            }
            console.log("Good letters check done", ws.uuid);

            var roomAlreadyExists = false;
            var thisClientInstance = -1;
            if (submittedServerId in servers) {
              // if this is a real server id

              // Room Change Allowance
              var allowRoomChange = false;
              var parsedInt = parseInt(submittedRoomId);
              console.log("parsedint is");
              console.log(parsedInt);

              if (
                isNaN(parsedInt) ||
                JSON.stringify(parsedInt).length != submittedRoomId.length
              ) {
                allowRoomChange = true;
              }
              if (submittedRoomId == JSON.stringify(submittedClientId)) {
                console.log(
                  "This client wants to go to their own room",
                  ws.uuid
                );
                allowRoomChange = true;
              }

              console.log("Submitted room id is ", ws.uuid);
              console.log(submittedRoomId, ws.uuid);
              console.log("Room change allowed?", ws.uuid);
              console.log(allowRoomChange, ws.uuid);
              if (allowRoomChange) {
                for (roomKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms) {
                  // scout all rooms and remove this guy
                  if (
                    submittedClientId in
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients
                  ) {
                    thisClientInstance =
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[submittedClientId];
                    console.log(
                      "Found this client in some room and removing from there",
                      ws.uuid
                    );
                    delete servers[submittedServerId].games[submittedGameId]
                      .rooms[roomKey].clients[submittedClientId]; // remove this client
                  }

                  var thisRoomName = roomKey;
                  if (thisRoomName == submittedRoomId) {
                    roomAlreadyExists = true;
                  }
                }

                // tell everyone in this room that this guy is gone
                for (var clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[thisClientInstance.roomId].clients) {
                  sendEventToClient(
                    {
                      eventName: "destroy_player",
                      clientId: parseInt(submittedClientId),
                    },
                    servers[submittedServerId].games[submittedGameId].rooms[
                      thisClientInstance.roomId
                    ].clients[clientKey].socket
                  );
                }

                // add user to desired room
                if (thisClientInstance != -1) {
                  if (roomAlreadyExists) {
                    console.log("Desired room already exists");
                    // room exists already

                    // add the client
                    servers[submittedServerId].games[submittedGameId].rooms[
                      submittedRoomId
                    ].addClient(thisClientInstance);
                    // pseudohost logic - time when client joined
                    servers[submittedServerId].games[submittedGameId].rooms[
                      submittedRoomId
                    ].clients[submittedClientId].joinedAt = Date.now();

                    // tell this client about all other persistent objects in the room
                    var thisRoom =
                      servers[submittedServerId].games[submittedGameId].rooms[
                        submittedRoomId
                      ];

                    for (let persistentObjectId in thisRoom.persistentObjects) {
                      sendEventToClient(
                        {
                          eventName: "pO_update",
                          POid: persistentObjectId,
                          pOp: thisRoom.persistentObjects[persistentObjectId]
                            .sharedProperties,
                          roomId: submittedRoomId,
                        },
                        ws
                      );
                    }
                  } else {
                    // room does not exist yet
                    console.log("Desired room does not exist yet", ws.uuid);
                    var room = new Room(submittedRoomId); // make room with given details
                    room.addClient(thisClientInstance); // add client here

                    // pseudohost logic - joinedat

                    room.clients[submittedClientId].joinedAt = Date.now();

                    servers[submittedServerId].games[submittedGameId].addRoom(
                      room
                    ); // add room to server
                  }
                }

                sendEventToClient(
                  {
                    eventName: "changed_room",
                    roomId: submittedRoomId,
                  },
                  ws
                );
                // every time there is a room change revise pseudohost
                servers[submittedServerId].games[submittedGameId].rooms[
                  submittedRoomId
                ].revisePseudoHost();

                UpdateServerInfoOnFirebase(submittedServerId);
              }
            } else {
              // invalid uid
              console.log("INVALID USER ID", ws.uuid);
              sendAlertToClient(
                ws,
                "show",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website2 "
              );
            }
          }
        }

        break;

      case "state_update":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedSharedPropeties = realData.sharedProperties;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedSharedPropeties &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedSharedPropeties == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            // fully validated

            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              for (var roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                for (var clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[roomKey].clients) {
                  if (
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].clientId == submittedClientId
                  ) {
                    // we have found this client.
                    // just update the sharedproperties
                    if (
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[clientKey].sharedProperties.length < 3
                    ) {
                      console.info(realData);
                    }
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].sharedProperties =
                      submittedSharedPropeties;
                  }
                }
              }
            } else {
              // invalid uid
              console.log(
                "submitted server id is" + submittedServerId,
                ws.uuid
              );
              console.log(
                "INVALID USER ID in state update or net yet created this customer's server on node",
                ws.uuid
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3 "
              );
            }
          }
        }

        break;
      case "entity_state_update":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedEntityProperties = realData.entityP;

        var submittedEntityId = realData.entityId;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedEntityProperties &&
          submittedEntityId &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedEntityId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedEntityProperties == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            // fully validated

            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              for (var roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                for (var clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[roomKey].clients) {
                  if (
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].clientId == submittedClientId
                  ) {
                    // we have found this client.
                    // just update the entity
                    var currentNumberOfEntities = Object.keys(
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[clientKey].entities
                    ).length;

                    const ENTITY_LIMIT = 100;
                    if (currentNumberOfEntities >= ENTITY_LIMIT) {
                      console.log(
                        "SERVER HAS REACHED MAX ENTITIES  CAPACITY for a client",
                        ws.uuid
                      );
                      sendAlertToClient(
                        ws,
                        "show",
                        " You Server has reached maximum ENTITIES capacity! Please upgrade your plan."
                      );
                      return;
                    }
                    //check if this entity exists
                    if (
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[clientKey].entities[submittedEntityId]
                    ) {
                      //just update the EPstring
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[clientKey].entities[
                        submittedEntityId
                      ].EPstring = submittedEntityProperties;
                    } else {
                      var newEntity = new Entity(submittedEntityProperties);
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[clientKey].entities[submittedEntityId] =
                        newEntity;
                    }
                  }
                }
              }
            } else {
              // invalid uid
              console.log(
                "submitted server id is" + submittedServerId,
                ws.uuid
              );
              console.log(
                "INVALID USER ID in state update or net yet created this customer's server on node",
                ws.uuid
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.5 "
              );
            }
          }
        }

        break;

      // SMTC event
      case "SMTC":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedReceiverClientId = realData.RclientId;
        var submittedMessage = realData.message;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedServerId &&
          submittedReceiverClientId &&
          submittedMessage &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedReceiverClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedMessage == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            // fully validated
            console.log("Got a Send message request", ws.uuid);
            console.log(realData, ws.uuid);

            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              for (var roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                for (var clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[roomKey].clients) {
                  if (
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].clientId == submittedClientId
                  ) {
                    // we have found this client.
                    // now send message to receiver
                    for (var roomKey2 in servers[submittedServerId].games[
                      submittedGameId
                    ].rooms) {
                      // in all rooms
                      if (
                        servers[submittedServerId].games[submittedGameId].rooms[
                          roomKey2
                        ].clients[submittedReceiverClientId]
                      ) {
                        // if the receiver is in this room
                        sendEventToClient(
                          {
                            eventName: "SMTC",
                            message: submittedMessage,
                            senderClientId: submittedClientId,
                          },
                          servers[submittedServerId].games[submittedGameId]
                            .rooms[roomKey2].clients[submittedReceiverClientId]
                            .socket
                        );
                        console.log("Sent the message.", ws.uuid);
                      }
                    }
                  }
                }
              }
            } else {
              // invalid uid
              console.log(
                "submitted server id is" + submittedServerId,
                ws.uuid
              );
              console.log(
                "INVALID USER ID in state update or not yet created this customer's server on node",
                ws.uuid
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.5 "
              );
            }
          }
        }

        break;

      // SETC event
      case "SETC":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedReceiverClientId = realData.RclientId;
        var submittedMessage = realData.message;
        var submittedEvent = realData.event;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedServerId &&
          submittedReceiverClientId &&
          submittedMessage &&
          submittedEvent &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedReceiverClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedMessage == "string" &&
            typeof submittedEvent == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            // fully validated
            console.log("Got a Send Event request", ws.uuid);
            console.log(realData, ws.uuid);

            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              for (var roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                for (var clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[roomKey].clients) {
                  if (
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].clientId == submittedClientId
                  ) {
                    // we have found this client.
                    // now send message to receiver
                    for (var roomKey2 in servers[submittedServerId].games[
                      submittedGameId
                    ].rooms) {
                      // in all rooms
                      if (
                        servers[submittedServerId].games[submittedGameId].rooms[
                          roomKey2
                        ].clients[submittedReceiverClientId]
                      ) {
                        // if the receiver is in this room
                        sendEventToClient(
                          {
                            eventName: "SETC",
                            message: submittedMessage,
                            event: submittedEvent,
                            senderClientId: submittedClientId,
                          },
                          servers[submittedServerId].games[submittedGameId]
                            .rooms[roomKey2].clients[submittedReceiverClientId]
                            .socket
                        );
                        console.log("Sent the event.", ws.uuid);
                      }
                    }
                  }
                }
              }
            } else {
              // invalid uid
              console.log(
                "submitted server id is" + submittedServerId,
                ws.uuid
              );
              console.log(
                "INVALID USER ID in state update or not yet created this customer's server on node",
                ws.uuid
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.5 "
              );
            }
          }
        }

        break;
      // SETS event
      case "SETS":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;

        var submittedMessage = realData.message;
        var submittedEvent = realData.event;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedServerId &&
          submittedMessage &&
          submittedEvent &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedMessage == "string" &&
            typeof submittedEvent == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            // fully validated
            console.log("Got a Send Event request", ws.uuid);
            console.log(realData, ws.uuid);

            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              try {
                var a = JSON.parse(submittedMessage);
                servers[submittedServerId].games[
                  submittedGameId
                ].handleEventToServer(submittedClientId, submittedEvent, a);
              } catch (e) {
                console.log(e);
              }
            } else {
              // invalid uid
              console.log(
                "submitted server id is" + submittedServerId,
                ws.uuid
              );
              console.log(
                "INVALID USER ID in state update or not yet created this customer's server on node",
                ws.uuid
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.5 "
              );
            }
          }
        }

        break;

      case "destroy_entity":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedEntityId = realData.entityId;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedEntityId &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedEntityId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string" // added validation for gameId
          ) {
            // fully validated
            console.log("An Entity has to be destroyed ", ws.uuid);

            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              for (var roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                for (var clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[roomKey].clients) {
                  if (
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].clientId == submittedClientId
                  ) {
                    // we have found this client.
                    // just delete the entity
                    delete servers[submittedServerId].games[submittedGameId]
                      .rooms[roomKey].clients[clientKey].entities[
                      submittedEntityId
                    ];
                    console.log("Deleting the entity if it exists...", ws.uuid);
                  }
                }
              }
            } else {
              // invalid uid
              console.log(
                "submitted server id is" + submittedServerId,
                ws.uuid
              );
              console.log(
                "INVALID USER ID in state update or not yet created this customer's server on node",
                ws.uuid
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.7 "
              );
            }
          }
        }

        break;

      case "show_all_rooms":
        var submittedServerId = ws.uuid;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (submittedServerId && submittedGameId) {
          if (
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              console.log(
                "Getting all Rooms for a show rooms request",
                ws.uuid
              );
              sendEventToClient(
                {
                  eventName: "all_rooms",
                  rooms: Object.keys(
                    servers[submittedServerId].games[submittedGameId].rooms
                  ),
                },
                ws
              );
            } else {
              // invalid uid
              console.log("INVALID USER ID", ws.uuid);
              sendAlertToClient(
                ws,
                "show",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website4"
              );
            }
          }
        }
        break;

      case "show_all_clients_in_room":
        var submittedServerId = ws.uuid;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (submittedServerId && submittedGameId) {
          if (
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              var submittedRoomId = realData.roomName;
              if (typeof submittedRoomId == "string") {
                if (submittedRoomId.length != 0) {
                  if (
                    submittedRoomId in
                    servers[submittedServerId].games[submittedGameId].rooms
                  ) {
                    console.log(
                      "Getting all client in room " +
                        submittedRoomId +
                        " for a show clients in room request",
                      ws.uuid
                    );
                    sendEventToClient(
                      {
                        eventName: "all_clients",
                        clients: Object.keys(
                          servers[submittedServerId].games[submittedGameId]
                            .rooms[submittedRoomId].clients
                        ),
                        roomId: submittedRoomId,
                      },
                      ws
                    );
                  } else {
                    // room does not exist on this server
                    sendEventToClient(
                      {
                        eventName: "all_clients",
                        clients: -1,
                      },
                      ws
                    );
                  }
                }
              }
            } else {
              // invalid uid
              console.log("INVALID USER ID", ws.uuid);
              sendAlertToClient(
                ws,
                "show",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website5 "
              );
            }
          }
        }
        break;

      case "show_pO_in_room":
        var submittedServerId = ws.uuid;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (submittedServerId && submittedGameId) {
          if (
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              var submittedRoomId = realData.roomName;
              if (typeof submittedRoomId == "string") {
                if (submittedRoomId.length != 0) {
                  if (
                    submittedRoomId in
                    servers[submittedServerId].games[submittedGameId].rooms
                  ) {
                    console.log(
                      "Getting all Persistent objects in room for a show PO req",
                      ws.uuid
                    );
                    sendEventToClient(
                      {
                        eventName: "all_pO",
                        pOs: Object.keys(
                          servers[submittedServerId].games[submittedGameId]
                            .rooms[submittedRoomId].persistentObjects
                        ),
                        roomId: submittedRoomId,
                      },
                      ws
                    );
                  } else {
                    // room does not exist on this server
                    console.log(
                      "Tried to get all Persistent objects in room for a show PO req, but the room didn't exist",
                      ws.uuid
                    );
                    sendEventToClient(
                      {
                        eventName: "all_pO",
                        pOs: -1,
                        roomId: submittedRoomId,
                      },
                      ws
                    );
                  }
                }
              }
            } else {
              // invalid uid
              console.log("INVALID USER ID", ws.uuid);
              sendAlertToClient(
                ws,
                "show",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website5.6 "
              );
            }
          }
        }
        break;

      case "disconnect":
        var submittedServerId = ws.uuid;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        for (roomKey in servers[submittedServerId].games[submittedGameId]
          .rooms) {
          // scout all rooms and remove this guy
          if (
            submittedClientId in
            servers[submittedServerId].games[submittedGameId].rooms[roomKey]
              .clients
          ) {
            thisClientInstance =
              servers[submittedServerId].games[submittedGameId].rooms[roomKey]
                .clients[submittedClientId];
            console.log(
              "A guy disconnected. Found this guy in some room and removing him",
              ws.uuid
            );

            delete servers[submittedServerId].games[submittedGameId].rooms[
              roomKey
            ].clients[submittedClientId]; // remove this client
            // revise pseudo host when someone disconnects
            servers[submittedServerId].games[submittedGameId].rooms[
              roomKey
            ].revisePseudoHost();
          }
        }

        sendEventToClient(
          {
            eventName: "disconnected",
          },
          ws
        );

        ws.close();

        break;

      case "ping":
        try {
          sendEventToClient(
            {
              eventName: "pong",
              ct: realData.ct,
            },
            ws
          );
        } catch (e) {}

        try {
          var submittedServerId = ws.uuid;
          var submittedClientId = realData.clientId;
          var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

          if (
            typeof submittedServerId === "string" &&
            typeof submittedClientId === "number" &&
            typeof submittedGameId === "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              // Iterate through rooms
              for (let roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                const room =
                  servers[submittedServerId].games[submittedGameId].rooms[
                    roomKey
                  ];

                // Check if the client is in the current room
                if (submittedClientId in room.clients) {
                  // Update the lastPingAt property to current time
                  room.clients[submittedClientId].lastPingAt = Date.now();
                  break; // Break the loop as we found and updated the client
                }
              }
            }
          }
        } catch (e) {
          console.log("Problem in updating afk", ws.uuid);
          console.log(e, ws.uuid);
        }

        break;

      case "get_server_time":
        try {
          sendEventToClient(
            {
              eventName: "get_server_time",
              time: Date.now(),
            },
            ws
          );
        } catch (e) {}

        break;

      case "create_persistent_object":
        var submittedServerId = ws.uuid;
        var submittedRoomId = realData.roomId;
        var submittedPersistentObjectProperties = realData.pOp;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedPersistentObjectProperties &&
          submittedRoomId &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedRoomId == "string" &&
            typeof submittedServerId == "string" &&
            typeof submittedPersistentObjectProperties == "string" &&
            typeof submittedGameId == "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              var totalPersistentObjects = 0;
              for (let roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                var room =
                  servers[submittedServerId].games[submittedGameId].rooms[
                    roomKey
                  ];
                totalPersistentObjects += Object.keys(
                  room.persistentObjects
                ).length;
              }

              //All validations done
              console.log("Got a create persistent object request.", ws.uuid);
              console.log(
                "Total persistent objects before adding this is " +
                  totalPersistentObjects,
                ws.uuid
              );
              const PERSISTENT_OBJECTS_LIMIT =
                servers[submittedServerId].maxClients * 10;
              if (totalPersistentObjects >= PERSISTENT_OBJECTS_LIMIT) {
                console.log(
                  "SERVER HAS REACHED MAX PERSISTENT OBJ CAPACITY",
                  ws.uuid
                );
                sendAlertToClient(
                  ws,
                  "show",
                  " Your Server has reached maximum PERSISTENT OBJECT capacity! Please upgrade your plan."
                );
                return;
              }
              if (submittedRoomId.trim().length == 0) {
                break;
              }

              //good letters check
              var goodLetters = true;
              for (let letter in submittedRoomId) {
                var allowedLetters =
                  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890";
                if (!allowedLetters.includes(submittedRoomId[letter])) {
                  goodLetters = false;
                  break;
                }
              }

              if (!goodLetters) {
                break;
              }

              var roomAlreadyExists = false;
              if (
                servers[submittedServerId].games[submittedGameId].rooms[
                  submittedRoomId
                ]
              ) {
                roomAlreadyExists = true;
              }

              //Room  Allowance
              var allowRoom = false;
              var parsedInt = parseInt(submittedRoomId);

              if (
                isNaN(parsedInt) ||
                JSON.stringify(parsedInt).length != submittedRoomId.length
              ) {
                allowRoom = true;
              }

              console.log("Submitted room id of PO is ", ws.uuid);
              console.log(submittedRoomId, ws.uuid);
              console.log("room  allowed?", ws.uuid);
              console.log(allowRoom, ws.uuid);
              if (allowRoom) {
                //add user to desired room
                //room exists already, add the persistent object
                var thisRoom = null;

                if (roomAlreadyExists) {
                  console.log("Desired room already exists", ws.uuid);

                  thisRoom =
                    servers[submittedServerId].games[submittedGameId].rooms[
                      submittedRoomId
                    ];
                } else {
                  //room does not exist yet
                  console.log("Desired room does not exist yet", ws.uuid);

                  var room = new Room(submittedRoomId); //make room with given details

                  servers[submittedServerId].addRoom(room); //add room to server
                  thisRoom = room;
                }

                //now that rooms are sorted, lets actually create the PO
                var newPO = new PersistentObject(
                  submittedPersistentObjectProperties,
                  thisRoom
                );

                //tell the creator we made his request
                sendEventToClient(
                  {
                    eventName: "created_PO",
                    POid: newPO.persistentObjectId,
                  },
                  ws
                );
                console.log("Created PO", ws.uuid);
              }

              //check if submitted room exists
            } else {
              //invalid uid
              console.log("submitted server id is" + submittedServerId);
              console.log(
                "INVALID USER ID in state update or net yet created this customer's server on node"
              );
              sendAlertToClient(
                ws,
                "unshow",
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.5 "
              );
            }
          }
        }
        break;

      case "edit_persistent_object":
        var submittedServerId = ws.uuid;
        var submittedPersistentObjectId = realData.POid;
        var submittedPersistentObjectProperties = realData.pOp;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedPersistentObjectProperties &&
          submittedPersistentObjectId &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedPersistentObjectId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedPersistentObjectProperties == "string" &&
            typeof submittedGameId == "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              for (let roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                var thisRoom =
                  servers[submittedServerId].games[submittedGameId].rooms[
                    roomKey
                  ];
                if (thisRoom.persistentObjects[submittedPersistentObjectId]) {
                  //edit it
                  console.info("editing the persistent object");
                  thisRoom.persistentObjects[
                    submittedPersistentObjectId
                  ].editProperties(
                    JSON.parse(submittedPersistentObjectProperties)
                  );

                  console.log("Edited a Persistent Object", ws.uuid);
                }
              }
            }
          }
        }
        break;

      case "destroy_persistent_object":
        var submittedServerId = ws.uuid;
        var submittedPersistentObjectId = realData.POid;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedPersistentObjectId &&
          submittedServerId &&
          submittedGameId
        ) {
          if (
            typeof submittedPersistentObjectId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string"
          ) {
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              console.log("Got a destroy persistent object request", ws.uuid);
              for (let roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                var thisRoom =
                  servers[submittedServerId].games[submittedGameId].rooms[
                    roomKey
                  ];
                if (thisRoom.persistentObjects[submittedPersistentObjectId]) {
                  thisRoom.persistentObjects[
                    submittedPersistentObjectId
                  ].destroy();

                  console.log("Destroyed a persistent object", ws.uuid);
                }
              }
            }
          }
        }

        break;

      case "kick_player":
        //console.log(realData);
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedVictimClientId = realData.KclientId;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          submittedClientId &&
          submittedServerId &&
          submittedVictimClientId &&
          submittedGameId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedVictimClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedGameId == "string"
          ) {
            //kick the victim
            if (
              submittedServerId in servers &&
              submittedGameId in servers[submittedServerId].games
            ) {
              console.log("Got a kick player request");
              for (let roomKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms) {
                for (let clientKey in servers[submittedServerId].games[
                  submittedGameId
                ].rooms[roomKey].clients) {
                  //destroy the websocket connection
                  if (clientKey == submittedVictimClientId) {
                    console.log(
                      submittedClientId +
                        " kicked " +
                        submittedVictimClientId +
                        " out",
                      ws.uuid
                    );
                    //send the disconnected from server callback
                    sendEventToClient(
                      {
                        eventName: "disconnected",
                      },
                      servers[submittedServerId].games[submittedGameId].rooms[
                        roomKey
                      ].clients[clientKey].socket
                    );
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[submittedVictimClientId].socket.close();
                  }
                }
              }
            }
          }
        }

        break;

      case "view_server_activity":
        var submittedServerId = ws.uuid;
        var submittedGameId = ws.gameId; // added to retrieve gameId from the websocket

        if (
          typeof submittedServerId == "string" &&
          typeof submittedGameId == "string"
        ) {
          if (
            submittedServerId in servers &&
            submittedGameId in servers[submittedServerId].games
          ) {
            var activity = {
              rooms: {},
            };
            for (let roomKey in servers[submittedServerId].games[
              submittedGameId
            ].rooms) {
              activity.rooms[roomKey] = {
                clients: {},
                persistentObjects: Object.keys(
                  servers[submittedServerId].games[submittedGameId].rooms[
                    roomKey
                  ].persistentObjects
                ),
              };

              //update clients
              for (let clientKey in servers[submittedServerId].games[
                submittedGameId
              ].rooms[roomKey].clients) {
                activity.rooms[roomKey].clients[clientKey] = {
                  entities: Object.keys(
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].entities
                  ),
                  afk:
                    Date.now() -
                    servers[submittedServerId].games[submittedGameId].rooms[
                      roomKey
                    ].clients[clientKey].lastPingAt,
                };
              }
            }

            //activity is updated fully

            sendEventToClient(
              {
                eventName: "full_server_view",
                activity: activity,
              },
              ws
            );
          }
        }

        break;

      case "set_simple_data":
        var submittedServerId = ws.uuid;
        var collectionName = realData.c;
        var documentName = realData.d;
        var fieldMap = realData.m;
        var writeId = realData.writeId;
        const sURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/setData";
        console.log("Someone wants to set simple data.", ws.uuid);
        console.log(realData, ws.uuid);
        axios
          .post(sURL, {
            collectionName: collectionName,
            documentName: documentName,
            fieldMap: fieldMap,
            serverId: submittedServerId,
          })
          .then((response) => {
            console.log("Response:", response.data, ws.uuid);
            console.info(Object.keys(response));
            console.info(response.status);
            console.info(console.statusText);
            if ((response.status = "200")) {
              sendEventToClient(
                {
                  eventName: "write_data",
                  writeId: writeId,
                },
                ws
              );
            } else {
              console.log(
                "The Response status code is not 200, but we got a response",
                ws.uuid
              );
              sendEventToClient(
                {
                  eventName: "write_data_fail",
                  writeId: writeId,
                },
                ws
              );
            }
            // Handle the response data as needed
          })
          .catch((error) => {
            console.error("Error:", error.response.data, ws.uuid);
            // Handle the error as needed
            sendEventToClient(
              {
                eventName: "write_data_fail",
                writeId: writeId,
              },
              ws
            );
          });
        break;
      case "add_to_simple_data":
        var submittedServerId = ws.uuid;
        var collectionName = realData.c;
        var documentName = realData.d;
        var fieldMap = realData.m;
        var patchId = realData.patchId;
        const aURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/database/" +
          collectionName +
          "/" +
          documentName;
        console.log("Someone wants to add to simple data.", ws.uuid);

        const headers2 = {
          Authorization: ws.uuid,
        };
        axios
          .patch(
            aURL,
            JSON.parse(fieldMap),

            { headers: headers2 } // Pass headers in the correct format
          )
          .then((response) => {
            console.log("Response:", response.data, ws.uuid);
            console.info(Object.keys(response));
            console.info(response.status);
            console.info(console.statusText);
            if (response.status === 200) {
              sendEventToClient(
                {
                  eventName: "patch_data",
                  patchId: patchId,
                },
                ws
              );
            } else {
              console.log(
                "The Response status code is not 200, but we got a response",
                ws.uuid
              );
              sendEventToClient(
                {
                  eventName: "patch_data_fail",
                  patchId: patchId,
                },
                ws
              );
            }
            // Handle the response data as needed
          })
          .catch((error) => {
            console.error("Error:", error.response.data, ws.uuid);
            // Handle the error as needed
            sendEventToClient(
              {
                eventName: "patch_data_fail",
                patchId: patchId,
              },
              ws
            );
          });
        break;

      case "read_simple_data":
        var submittedServerId = ws.uuid;
        var collectionName = realData.c;
        var documentName = realData.d;
        var readId = realData.readId;
        const rURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/readData";
        console.log("Someone wants to read simple data.", ws.uuid);
        console.log(realData, ws.uuid);
        axios
          .post(rURL, {
            collectionName: collectionName,
            documentName: documentName,
            serverId: submittedServerId,
            readId: readId,
          })
          .then((response) => {
            // console.log("Response:", response.status, ws.uuid);
            if (response.status == 404) {
              console.log("404");
              sendEventToClient(
                {
                  eventName: "read_data",
                  data: -1,
                  readId: readId,
                },
                ws
              );
            }
            if (response.status == 200) {
              // Handle the response data as needed
              sendEventToClient(
                {
                  eventName: "read_data",
                  data: response.data,
                  readId: readId,
                },
                ws
              );
            }
          })
          .catch((error) => {
            console.error("Error:");
            if (error.response.status == 404) {
              console.log("404, document not found");
              sendEventToClient(
                {
                  eventName: "read_data",
                  data: -1,
                  readId: readId,
                },
                ws
              );
            }

            // Handle the error as needed
          });
        break;
      case "delete_simple_data":
        var submittedServerId = ws.uuid;
        var collectionName = realData.c;
        var documentName = realData.d;
        const dURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/deleteData";
        console.log("Someone wants to delete simple data.", ws.uuid);
        console.log(realData, ws.uuid);
        axios
          .post(dURL, {
            collectionName: collectionName,
            documentName: documentName,
            serverId: submittedServerId,
          })
          .then((response) => {
            console.log("Response:", response.data, ws.uuid);
            // Handle the response data as needed
          })
          .catch((error) => {
            console.error("Error:", error.response.data, ws.uuid);
            // Handle the error as needed
          });
        break;

      case "get_db_summary":
        var submittedServerId = ws.uuid;

        const mURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/database/metadata";
        const headers = {
          Authorization: submittedServerId,
        };

        axios
          .get(mURL, {
            headers,
          })
          .then((response) => {
            // console.log("Response:", response.status, ws.uuid);

            try {
              var db = {};
              for (let i in response.data) {
                var docs = [];
                for (let j in response.data[i].documents) {
                  docs.push(response.data[i].documents[j].name);
                }
                db[response.data[i].name] = docs;
              }
              console.log(db);
              if (response.status == 200) {
                // Handle the response data as needed
                sendEventToClient(
                  {
                    eventName: "db_summary",
                    db: db,
                  },
                  ws
                );
              }
            } catch (e) {}
          })
          .catch((error) => {
            console.error("Error:");
            console.log(error, ws.uuid);
            if (error.response.status == 404) {
              console.log("404, error in getting server");
            }

            // Handle the error as needed
          });
        break;
    }
  });

  // handling what to do when clients disconnects from server
  ws.on("close", () => {
    console.log("someone disconnected", ws.uuid);

    ws.isClosed = true;
  });

  // handling client connection error
  ws.onerror = function () {
    console.log("Some Error occurred in websocket", ws.uuid);
  };
});
console.info("The WebSocket server is running");

server.listen(process.env.PORT || 3000, () => {
  console.info(`WebSocket server listening on port ${process.env.PORT} `);
});
