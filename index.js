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

//Cleans up unused rooms and clients
function CleanRoomsAndClients() {
  for (let serverKey in servers) {
    servers[serverKey].RoomsCleanup();
    for (let roomKey in servers[serverKey].rooms) {
      servers[serverKey].rooms[roomKey].clientsCleanup();
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
    rooms: {},
  };

  if (uuid in servers) {
    for (let roomKey in servers[uuid].rooms) {
      activity.rooms[roomKey] = {
        clients: {},
        persistentObjects: Object.keys(
          servers[uuid].rooms[roomKey].persistentObjects
        ),
      };

      //update clients
      //update clients
      for (let clientKey in servers[uuid].rooms[roomKey].clients) {
        activity.rooms[roomKey].clients[clientKey] = {
          entities: Object.keys(
            servers[uuid].rooms[roomKey].clients[clientKey].entities
          ),
          afk:
            Date.now() -
            servers[uuid].rooms[roomKey].clients[clientKey].lastPingAt,
        };
      }
    }

    //activity is updated fully
  }

  return activity;
}

/*
 * State Updates
 */
function StateUpdate() {
  for (let serverKey in servers) {
    //in this server
    for (let roomKey in servers[serverKey].rooms) {
      //in this room
      for (let clientKey in servers[serverKey].rooms[roomKey].clients) {
        var stringToSend = {
          eventName: "state_update",
          clientId: parseInt(clientKey),
          roomId: roomKey,
          afk:
            Date.now() -
            servers[serverKey].rooms[roomKey].clients[clientKey].lastPingAt,
          SP: servers[serverKey].rooms[roomKey].clients[clientKey]
            .sharedProperties,
          entities: JSON.stringify(
            servers[serverKey].rooms[roomKey].clients[clientKey].entities
          ), //EXPERIMENTAL
        };
        //console.log("string to send is");
        //console.log(stringToSend);

        if (!stringToSend.SP) {
          break;
        }

        //DONT SEND STATE UPDATES FOR DEAD PLAYERS
        if (
          servers[serverKey].rooms[roomKey].clients[clientKey].socket.isClosed
        ) {
          break;
        }

        //send to other players
        for (let otherClientKey in servers[serverKey].rooms[roomKey].clients) {
          if (otherClientKey != clientKey) {
            sendEventToClient(
              stringToSend,
              servers[serverKey].rooms[roomKey].clients[otherClientKey].socket
            );
          }
        }

        // servers[serverKey].rooms[roomKey].clients[clientKey]
      }
    }
  }

  setTimeout(StateUpdate, 1000 / 60);
}
// StateUpdate();

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
  try {
    // Assuming your hash-to-UUID mapping is stored under "/crypto" in the Firebase database
    const snapshot = await db.ref("/crypto/" + hash).once("value");

    // Check if the snapshot has any data
    if (snapshot.exists()) {
      // The hash exists in the database, return the corresponding UUID
      const uuid = snapshot.val();
      return uuid;
    } else {
      // Hash not found
      return null;
    }
  } catch (error) {
    console.error("Error retrieving UUID from Firebase:", error.message);
    throw error;
  }
}

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
    this.rooms = {};
    this.stateUpdate();
  }

  addRoom(room) {
    room.serverId = this.serverId;
    this.rooms[room.roomId] = room;
  }

  NumberOfClientsOnthisServer() {
    var count = 0;
    for (var key in this.rooms) {
      var room = this.rooms[key];
      count += Object.keys(room.clients).length;
    }
    return count;
  }

  RoomsCleanup() {
    for (var key in this.rooms) {
      if (
        Object.keys(this.rooms[key].clients).length == 0 &&
        Object.keys(this.rooms[key].persistentObjects).length == 0
      ) {
        delete this.rooms[key];
      }
    }
  }

  getClientsInArray() {
    var cArr = [];
    for (var roomKey in this.rooms) {
      cArr = cArr.concat(this.rooms[roomKey].getClientsInArray());
    }
    return cArr;
  }

  stateUpdate() {
    // Your state update logic goes here
    for (let roomKey in this.rooms) {
      for (let clientKey in this.rooms[roomKey].clients) {
        var stringToSend = {
          eventName: "state_update",
          clientId: parseInt(clientKey),
          roomId: roomKey,
          afk: Date.now() - this.rooms[roomKey].clients[clientKey].lastPingAt,
          SP: this.rooms[roomKey].clients[clientKey].sharedProperties,
          entities: JSON.stringify(
            this.rooms[roomKey].clients[clientKey].entities
          ),
        };

        if (
          !stringToSend.SP ||
          this.rooms[roomKey].clients[clientKey].socket.isClosed
        ) {
          continue; // Skip sending updates for dead players or players with missing shared properties
        }

        // send to other players
        for (let otherClientKey in this.rooms[roomKey].clients) {
          if (otherClientKey != clientKey) {
            sendEventToClient(
              stringToSend,
              this.rooms[roomKey].clients[otherClientKey].socket
            );
          }
        }
      }
    }

    // Use this.frameRate for the frame rate of this server
    setTimeout(() => this.stateUpdate(), 1000 / this.frameRate);
  }
}

class Room {
  constructor(roomId) {
    //the main fucking constructor
    this.roomId = roomId;
  }
  serverId = -111111; //the server id that this room belongs to

  clients = {
    //an empty dictionary
    //all clients can go here
  };

  persistentObjects = {
    //an empty dictionary
    //all persistent objects can go here
  };

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
          UpdateServerInfoOnFirebase(thisServerId);

          //tell others in this room that this guy is gone
          for (var clientKey in this.clients) {
            sendEventToClient(
              {
                eventName: "destroy_player",
                clientId: parseInt(key),
              },
              this.clients[clientKey].socket
            );
          }
          //revise pseudohost
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
  roomId = -167; //the room that this belongs to
  clientId = ++clientId; //CAN REMOVE THE  ++

  sharedProperties = "";
  isPseudoHost = false;
  lastPingAt = Date.now();

  entities = {};
}

class PersistentObject {
  constructor(sharedProperties) {
    this.persistentObjectId = persistentObjectId++;
    this.sharedProperties = sharedProperties;
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
      } else {
        var stringToSend = {
          eventName: "alert",
          message:
            "The server has not been initiated yet, please play your game, then refresh this page and you can see logs!",
        };
        ws.send(JSON.stringify(stringToSend));
      }
    }

    if (realData.eventName != "state_update") {
      // console.log(realData);
    }

    switch (realData.eventName) {
      case "join_server":
        //VALIDATIONS

        if (typeof realData.serverId != "string") {
          break;
        } else {
          if (realData.serverId.length > 100) {
            break;
          }
        }

        var useCiphering = realData.uC;
        if (typeof useCiphering == "boolean") {
          ws.useCiphering = useCiphering;
        } else {
          ws.useCiphering = false;
        }
        //check if this is a real uid/serverid or not
        const hashOfUUID = realData.serverId;
        let providedUid = "";
        console.log(hashOfUUID);
        if (realData.serverId.length == 32) {
          console.log("length is");
          console.log(realData.serverId.length);
          //this is a hash
          providedUid = await hashToUUIDfromFirebase(hashOfUUID);
          //attach the uuid to the websocket
          ws.uuid = providedUid;
        } else {
          //this is not hashed
          ws.uuid = realData.serverId;
          providedUid = ws.uuid;
        }
        console.log("Someone wants to join your server", ws.uuid);
        var serverInfo = await getServerInfo(ws.uuid);
        console.log(" the current serverInfo is", ws.uuid);
        console.log(serverInfo, ws.uuid);

        if (serverInfo != -1) {
          //the provided uid is real
          //check if this server is already there in servers dict
          if (providedUid in servers) {
            //this server is already running
            servers[providedUid].maxClients = serverInfo.maxClients; //update maxclients everytime someone joins

            //CHECK HOW MANY CLIENTS ARE THERE HERE !!!! ONLY if less than maxclients you can allow
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

              var client = new Client(ws); //create client
              var room = new Room(client.clientId); //make personal room for client
              room.addClient(client); //add client here

              servers[providedUid].addRoom(room); //add room to server

              //Tell this clent we created you
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
                  " You Server has reached maximum client capacity! Please upgrade your plan."
                );
              }
            }
          } else {
            console.log("Creating new server on nodejs.", ws.uuid);
            //this server needs to be just started

            var newServer = new Server(providedUid, serverInfo.maxClients);
            servers[providedUid] = newServer;

            var client = new Client(ws); //create client
            var room = new Room(client.clientId); //make personal room for client
            room.addClient(client); //add client here

            newServer.addRoom(room); //add room to server

            //Tell this clent we created you
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
          //invalid uid
          console.log("INVALID USER ID", ws.uuid);
          sendAlertToClient(
            ws,
            "show",
            "Invalid Server ID. Please make sure this is your Server ID shown on the website! "
          );
        }

        //console.log(servers);

        break;

      case "change_room":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedRoomId = realData.roomId;

        if (submittedClientId && submittedRoomId && submittedServerId) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedRoomId == "string" &&
            typeof submittedServerId == "string"
          ) {
            console.log(
              "Got a Room Change Request. from" +
                submittedClientId +
                "Room Change validation done",
              ws.uuid
            );
            //All validations done
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
            var thisClientInstance = -1;
            if (submittedServerId in servers) {
              //if this is a real server id

              //Room Change Allowance
              var allowRoomChange = false;
              var parsedInt = parseInt(submittedRoomId);

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
                for (roomKey in servers[submittedServerId].rooms) {
                  //scout all rooms and remove this guy
                  if (
                    submittedClientId in
                    servers[submittedServerId].rooms[roomKey].clients
                  ) {
                    thisClientInstance =
                      servers[submittedServerId].rooms[roomKey].clients[
                        submittedClientId
                      ];
                    console.log(
                      "Found this client in some room and removing from there",
                      ws.uuid
                    );
                    delete servers[submittedServerId].rooms[roomKey].clients[
                      submittedClientId
                    ]; //remove this client
                  }

                  var thisRoomName = roomKey;
                  if (thisRoomName == submittedRoomId) {
                    roomAlreadyExists = true;
                  }
                }

                //tell everyone in this room that this guy is gone
                for (var clientKey in servers[submittedServerId].rooms[
                  thisClientInstance.roomId
                ].clients) {
                  sendEventToClient(
                    {
                      eventName: "destroy_player",
                      clientId: parseInt(submittedClientId),
                    },
                    servers[submittedServerId].rooms[thisClientInstance.roomId]
                      .clients[clientKey].socket
                  );
                }

                //add user to desired room
                if (thisClientInstance != -1) {
                  if (roomAlreadyExists) {
                    console.log("Desired room already exists");
                    //room exists already

                    //add the client
                    servers[submittedServerId].rooms[submittedRoomId].addClient(
                      thisClientInstance
                    );
                    //pseudohost logic - time when client joined
                    servers[submittedServerId].rooms[submittedRoomId].clients[
                      submittedClientId
                    ].joinedAt = Date.now();

                    //tell this client about all other persistent objects in the room
                    var thisRoom =
                      servers[submittedServerId].rooms[submittedRoomId];

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
                    //room does not exist yet
                    console.log("Desired room does not exist yet", ws.uuid);
                    var room = new Room(submittedRoomId); //make room with given details
                    room.addClient(thisClientInstance); //add client here

                    //pseudohost logic - joinedat

                    room.clients[submittedClientId].joinedAt = Date.now();

                    servers[submittedServerId].addRoom(room); //add room to server
                  }
                }
                //servers[submittedServerId].rooms[submittedRoomId].clients[submittedClientId]

                sendEventToClient(
                  {
                    eventName: "changed_room",
                    roomId: submittedRoomId,
                  },
                  ws
                );
                //every time there is a room change revise pseudohost
                servers[submittedServerId].rooms[
                  submittedRoomId
                ].revisePseudoHost();

                UpdateServerInfoOnFirebase(submittedServerId);
              }
            } else {
              //invalid uid
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
        if (
          submittedClientId &&
          submittedSharedPropeties &&
          submittedServerId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedSharedPropeties == "string"
          ) {
            //fully validated

            if (submittedServerId in servers) {
              for (var roomKey in servers[submittedServerId].rooms) {
                for (var clientKey in servers[submittedServerId].rooms[roomKey]
                  .clients) {
                  if (
                    servers[submittedServerId].rooms[roomKey].clients[clientKey]
                      .clientId == submittedClientId
                  ) {
                    //we have found this client.
                    //just update the sharedproperties
                    servers[submittedServerId].rooms[roomKey].clients[
                      clientKey
                    ].sharedProperties = submittedSharedPropeties;
                  }
                }
              }
            } else {
              //invalid uid
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
        if (
          submittedClientId &&
          submittedEntityProperties &&
          submittedEntityId &&
          submittedServerId
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedEntityId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedEntityProperties == "string"
          ) {
            //fully validated

            if (submittedServerId in servers) {
              for (var roomKey in servers[submittedServerId].rooms) {
                for (var clientKey in servers[submittedServerId].rooms[roomKey]
                  .clients) {
                  if (
                    servers[submittedServerId].rooms[roomKey].clients[clientKey]
                      .clientId == submittedClientId
                  ) {
                    //we have found this client.
                    //just update the entity
                    var currentNumberOfEntities = Object.keys(
                      servers[submittedServerId].rooms[roomKey].clients[
                        clientKey
                      ].entities
                    ).length;
                    console.log(
                      "Total entities on client id " +
                        clientKey +
                        " before adding this is " +
                        currentNumberOfEntities,
                      ws.uuid
                    );
                    const ENTITY_LIMIT = 30;
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
                    servers[submittedServerId].rooms[roomKey].clients[
                      clientKey
                    ].entities[submittedEntityId] = submittedEntityProperties;
                  }
                }
              }
            } else {
              //invalid uid
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

      case "SMTC":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;
        var submittedReceiverClientId = realData.RclientId;
        var submittedMessage = realData.message;
        if (
          submittedClientId &&
          submittedServerId &&
          submittedReceiverClientId &&
          submittedMessage
        ) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedReceiverClientId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedMessage == "string"
          ) {
            //fully validated
            console.log("Got a Send message request", ws.uuid);
            console.log(realData, ws.uuid);

            if (submittedServerId in servers) {
              for (var roomKey in servers[submittedServerId].rooms) {
                for (var clientKey in servers[submittedServerId].rooms[roomKey]
                  .clients) {
                  if (
                    servers[submittedServerId].rooms[roomKey].clients[clientKey]
                      .clientId == submittedClientId
                  ) {
                    //we have found this client.
                    // now send message to reciever
                    for (var roomKey2 in servers[submittedServerId].rooms) {
                      //in all rooms
                      if (
                        servers[submittedServerId].rooms[roomKey2].clients[
                          submittedReceiverClientId
                        ]
                      ) {
                        //if the reciever is in this room
                        sendEventToClient(
                          {
                            eventName: "SMTC",
                            message: submittedMessage,
                            senderClientId: submittedClientId,
                          },
                          servers[submittedServerId].rooms[roomKey2].clients[
                            submittedReceiverClientId
                          ].socket
                        );
                        console.log("Sent the message.", ws.uuid);
                      }
                    }
                  }
                }
              }
            } else {
              //invalid uid
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

      case "destroy_entity":
        var submittedServerId = ws.uuid;
        var submittedClientId = realData.clientId;

        var submittedEntityId = realData.entityId;
        if (submittedClientId && submittedEntityId && submittedServerId) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedEntityId == "number" &&
            typeof submittedServerId == "string"
          ) {
            //fully validated
            console.log("An Entity has to be destroyed ", ws.uuid);

            if (submittedServerId in servers) {
              for (var roomKey in servers[submittedServerId].rooms) {
                for (var clientKey in servers[submittedServerId].rooms[roomKey]
                  .clients) {
                  if (
                    servers[submittedServerId].rooms[roomKey].clients[clientKey]
                      .clientId == submittedClientId
                  ) {
                    //we have found this client.
                    //just delete the entity
                    delete servers[submittedServerId].rooms[roomKey].clients[
                      clientKey
                    ].entities[submittedEntityId];
                    console.log("Deleting the entity if it exists...", ws.uuid);
                  }
                }
              }
            } else {
              //invalid uid
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
                "Invalid Server ID. Please make sure this is your Server ID shown on the website3.7 "
              );
            }
          }
        }

        break;

      case "show_all_rooms":
        var submittedServerId = ws.uuid;
        if (submittedServerId) {
          if (typeof submittedServerId == "string") {
            if (submittedServerId in servers) {
              console.log(
                "Getting all Rooms for a show rooms request",
                ws.uuid
              );
              sendEventToClient(
                {
                  eventName: "all_rooms",
                  rooms: Object.keys(servers[submittedServerId].rooms),
                },
                ws
              );
            } else {
              //invalid uid
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
        if (submittedServerId) {
          if (typeof submittedServerId == "string") {
            if (submittedServerId in servers) {
              var submittedRoomId = realData.roomName;
              if (typeof submittedRoomId == "string") {
                if (submittedRoomId.length != 0) {
                  if (submittedRoomId in servers[submittedServerId].rooms) {
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
                          servers[submittedServerId].rooms[submittedRoomId]
                            .clients
                        ),
                        roomId: submittedRoomId,
                      },
                      ws
                    );
                  } else {
                    //room does not exist on this server
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
              //invalid uid
              console.log("INVALID USER ID");
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
        if (submittedServerId) {
          if (typeof submittedServerId == "string") {
            if (submittedServerId in servers) {
              var submittedRoomId = realData.roomName;
              if (typeof submittedRoomId == "string") {
                if (submittedRoomId.length != 0) {
                  if (submittedRoomId in servers[submittedServerId].rooms) {
                    console.log(
                      "Getting all Persistent objects in room for a show PO req",
                      ws.uuid
                    );
                    sendEventToClient(
                      {
                        eventName: "all_pO",
                        pOs: Object.keys(
                          servers[submittedServerId].rooms[submittedRoomId]
                            .persistentObjects
                        ),
                        roomId: submittedRoomId,
                      },
                      ws
                    );
                  } else {
                    //room does not exist on this server
                    console.log(
                      "Tried to get all Persistent objects in room for a show PO req, but the room didnt exist",
                      ws.uuid
                    );
                    sendEventToClient(
                      {
                        eventName: "all_pO",
                        pOs: -1,
                      },
                      ws
                    );
                  }
                }
              }
            } else {
              //invalid uid
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
        for (roomKey in servers[submittedServerId].rooms) {
          //scout all rooms and remove this guy
          if (
            submittedClientId in
            servers[submittedServerId].rooms[roomKey].clients
          ) {
            thisClientInstance =
              servers[submittedServerId].rooms[roomKey].clients[
                submittedClientId
              ];
            console.log(
              "A guy disconnected. Found this guy in some room and removing him",
              ws.uuid
            );

            delete servers[submittedServerId].rooms[roomKey].clients[
              submittedClientId
            ]; //remove this client
            //revise pseudo host
            servers[submittedServerId].rooms[roomKey].revisePseudoHost();
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

          if (
            typeof submittedServerId === "string" &&
            typeof submittedClientId === "number"
          ) {
            if (submittedServerId in servers) {
              // Iterate through rooms
              for (let roomKey in servers[submittedServerId].rooms) {
                const room = servers[submittedServerId].rooms[roomKey];

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
        if (
          submittedPersistentObjectProperties &&
          submittedRoomId &&
          submittedServerId
        ) {
          if (
            typeof submittedRoomId == "string" &&
            typeof submittedServerId == "string" &&
            typeof submittedPersistentObjectProperties == "string"
          ) {
            if (submittedServerId in servers) {
              var totalPersistentObjects = 0;
              for (let roomKey in servers[submittedServerId].rooms) {
                var room = servers[submittedServerId].rooms[roomKey];
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
                  " You Server has reached maximum PERSISTENT OBJECT capacity! Please upgrade your plan."
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
              if (servers[submittedServerId].rooms[submittedRoomId]) {
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
                var newPO = new PersistentObject(
                  submittedPersistentObjectProperties
                );
                if (roomAlreadyExists) {
                  console.log("Desired room already exists", ws.uuid);

                  servers[submittedServerId].rooms[
                    submittedRoomId
                  ].persistentObjects[newPO.persistentObjectId] = newPO;

                  var thisRoom =
                    servers[submittedServerId].rooms[submittedRoomId];
                  //tell everyone in this room that there is a new persistent object
                  for (clientKey in thisRoom.clients) {
                    sendEventToClient(
                      {
                        eventName: "pO_update",
                        POid: newPO.persistentObjectId,
                        pOp: submittedPersistentObjectProperties,
                        roomId: submittedRoomId,
                      },
                      thisRoom.clients[clientKey].socket
                    );
                  }
                } else {
                  //room does not exist yet
                  console.log("Desired room does not exist yet", ws.uuid);

                  var room = new Room(submittedRoomId); //make room with given details
                  room.persistentObjects[newPO.persistentObjectId] = newPO;
                  servers[submittedServerId].addRoom(room); //add room to server
                }

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

        if (
          submittedPersistentObjectProperties &&
          submittedPersistentObjectId &&
          submittedServerId
        ) {
          if (
            typeof submittedPersistentObjectId == "number" &&
            typeof submittedServerId == "string" &&
            typeof submittedPersistentObjectProperties == "string"
          ) {
            if (submittedServerId in servers) {
              for (let roomKey in servers[submittedServerId].rooms) {
                var thisRoom = servers[submittedServerId].rooms[roomKey];
                if (thisRoom.persistentObjects[submittedPersistentObjectId]) {
                  thisRoom.persistentObjects[
                    submittedPersistentObjectId
                  ].sharedProperties = submittedPersistentObjectProperties;
                  console.log("Edited a Persistent Object", ws.uuid);
                  //tell everyone in this room that this po is edited
                  for (clientKey in thisRoom.clients) {
                    sendEventToClient(
                      {
                        eventName: "pO_update",
                        POid: submittedPersistentObjectId,
                        pOp: submittedPersistentObjectProperties,
                        roomId: roomKey,
                      },
                      thisRoom.clients[clientKey].socket
                    );
                  }
                }
              }
            }
          }
        }
        break;

      case "destroy_persistent_object":
        var submittedServerId = ws.uuid;
        var submittedPersistentObjectId = realData.POid;

        if (submittedPersistentObjectId && submittedServerId) {
          if (
            typeof submittedPersistentObjectId == "number" &&
            typeof submittedServerId == "string"
          ) {
            if (submittedServerId in servers) {
              console.log("Got a destroy persistent object request", ws.uuid);
              for (let roomKey in servers[submittedServerId].rooms) {
                var thisRoom = servers[submittedServerId].rooms[roomKey];
                if (thisRoom.persistentObjects[submittedPersistentObjectId]) {
                  delete thisRoom.persistentObjects[
                    submittedPersistentObjectId
                  ];
                  console.log("Destroyed a persistent object", ws.uuid);
                  //tell everyone in this room that this po is deleted
                  for (clientKey in thisRoom.clients) {
                    sendEventToClient(
                      {
                        eventName: "destroy_pO",
                        POid: submittedPersistentObjectId,
                      },
                      thisRoom.clients[clientKey].socket
                    );
                  }
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

        if (submittedClientId && submittedServerId && submittedVictimClientId) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedVictimClientId == "number" &&
            typeof submittedServerId == "string"
          ) {
            //kick the victim
            if (submittedServerId in servers) {
              console.log("Got a kick player request");
              for (let roomKey in servers[submittedServerId].rooms) {
                for (let clientKey in servers[submittedServerId].rooms[roomKey]
                  .clients) {
                  //destroy the websocket connection

                  if (clientKey == submittedVictimClientId) {
                    console.log(
                      submittedClientId +
                        " kicked " +
                        submittedVictimClientId +
                        " out",
                      ws.uuid
                    );
                    //send the disconencted from server callback
                    sendEventToClient(
                      {
                        eventName: "disconnected",
                      },
                      servers[submittedServerId].rooms[roomKey].clients[
                        clientKey
                      ].socket
                    );
                    servers[submittedServerId].rooms[roomKey].clients[
                      submittedVictimClientId
                    ].socket.close();
                  }
                }
              }
            }
          }
        }

        break;

      case "view_server_activity":
        var submittedServerId = ws.uuid;
        if (typeof submittedServerId == "string") {
          if (submittedServerId in servers) {
            var activity = {
              rooms: {},
            };
            for (let roomKey in servers[submittedServerId].rooms) {
              activity.rooms[roomKey] = {
                clients: {},
                persistentObjects: Object.keys(
                  servers[submittedServerId].rooms[roomKey].persistentObjects
                ),
              };

              //update clients
              for (let clientKey in servers[submittedServerId].rooms[roomKey]
                .clients) {
                activity.rooms[roomKey].clients[clientKey] = {
                  entities: Object.keys(
                    servers[submittedServerId].rooms[roomKey].clients[clientKey]
                      .entities
                  ),
                  afk:
                    Date.now() -
                    servers[submittedServerId].rooms[roomKey].clients[clientKey]
                      .lastPingAt,
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
        const sURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/setData";

        axios
          .post(sURL, {
            collectionName: collectionName,
            documentName: documentName,
            fieldMap: fieldMap,
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
      case "read_simple_data":
        var submittedServerId = ws.uuid;
        var collectionName = realData.c;
        var documentName = realData.d;
        var readId = realData.readId;
        const rURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/readData";

        axios
          .post(rURL, {
            collectionName: collectionName,
            documentName: documentName,
            serverId: submittedServerId,
            readId: readId,
          })
          .then((response) => {
            console.log("Response:", response.status, ws.uuid);
            if (response.status == 404) {
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
            console.error("Error:", error);
            // Handle the error as needed
          });
        break;
      case "delete_simple_data":
        var submittedServerId = ws.uuid;
        var collectionName = realData.c;
        var documentName = realData.d;
        const dURL =
          "https://us-central1-rocket-networking.cloudfunctions.net/api/deleteData";

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
