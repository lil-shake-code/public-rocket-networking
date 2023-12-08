const os = require("os");

console.log(os.hostname());

const http = require("http");
const WebSocket = require("ws");
//allow cors
const cors = require("cors");
const express = require("express");
const app = express();
app.use(cors());

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
      // console.log(snapshot)
      finalValue = snapshot.val();
    },
    (errorObject) => {
      console.log("The read failed: " + errorObject.name);
    }
  );
  if (!finalValue) {
    finalValue = -1;
  }
  console.log("getserverinfo function has returned a value");

  return finalValue;
}

/*
 * Update server info
 */

function UpdateServerInfoOnFirebase(providedUid) {
  setServerInfo(providedUid, "/activity", getServerActivity(providedUid));
}

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
  ws.send(JSON.stringify(stringToSend));
}

/*
 *send event to client
 *
 */
function sendEventToClient(eventObject, ws) {
  ws.send(JSON.stringify(eventObject));
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
  var activityy = {};
  for (let roomKey in servers[uuid].rooms) {
    activityy[roomKey] = {
      clients: Object.keys(servers[uuid].rooms[roomKey].clients),
    };
  }

  return activityy;
}

/*
 * Check for Server Level validation
 */
function checkServerLevelValidation(submittedServerId) {
  if (submittedServerId) {
    if (typeof submittedServerId == "string") {
      if (submittedServerId in servers) {
        return true;
      }
    }
  }
  return false;
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
StateUpdate();

//counters
var clientId = 0;
var roomId = 0;
var serverId = 0;

//object for servers
var servers = {};

class Server {
  constructor(serverId, maxClients) {
    //the uuid from thunkable
    this.serverId = serverId;
    this.maxClients = maxClients;
  }

  rooms = {};
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
      if (Object.keys(this.rooms[key].clients).length == 0) {
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
}
class Client {
  constructor(ws) {
    this.socket = ws;
  }
  roomId = -167; //the room that this belongs to
  clientId = ++clientId; //CAN REMOVE THE  ++

  sharedProperties = "";

  entities = {};
}

wss.on("connection", (ws) => {
  //stuff we want to happen after player connects goes down here
  console.log("someone connected");

  ws.isClosed = false;

  //when the client sends us a message
  ws.on("message", async (data) => {
    // console.log(`Client has sent us: ${data}`);
    var realData = JSON.parse(data);

    if (realData.eventName != "state_update") {
      //.log(realData);
    }

    switch (realData.eventName) {
      case "join_server":
        console.log(realData);

        //VALIDATIONS
        if (true) {
          if (typeof realData.serverId != "string") {
            break;
          } else {
            if (realData.serverId.length > 100) {
              break;
            }
          }
        }
        console.log("made it through all validations");
        //check if this is a real uid/serverid or not
        const providedUid = realData.serverId;
        var serverInfo = await getServerInfo(providedUid);
        console.log("serverInfo is");
        console.log(serverInfo);

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
                "Number of clients on this server before adding this new guy is"
              );
              console.log(servers[providedUid].NumberOfClientsOnthisServer());

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
                console.log("SERVER is not allowed to have players!");
                sendAlertToClient(
                  ws,
                  "show",
                  " Your free trial is over! Please support us by upgrading your plan."
                );
              } else {
                console.log("SERVER HAS REACHED MAX CAPACITY");
                sendAlertToClient(
                  ws,
                  "show",
                  " You Server has reached maximum client capacity! Please upgrade your plan."
                );
              }
            }
          } else {
            console.log("creating new server on nodejs");
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
          console.log("INVALID USER ID");
          sendAlertToClient(
            ws,
            "show",
            "Invalid Server ID. Please make sure this is your Server ID shown on the website! "
          );
        }

        //console.log(servers);

        break;

      case "change_room":
        console.log(`Client has sent us: ${data}`);

        const { serverId, clientId, roomId } = realData;
        const allowedLetters =
          "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ 1234567890";
        const validData =
          typeof clientId === "number" &&
          typeof roomId === "string" &&
          roomId.trim() &&
          allowedLetters.split("").every((char) => roomId.includes(char));
        const server = servers[serverId];
        let roomAlreadyExists = false,
          thisClientInstance = -1;

        if (validData && server) {
          console.log("room change validations done");
          let allowRoomChange = isNaN(roomId) || roomId == clientId.toString();
          console.log("room change allowed?", allowRoomChange);

          if (allowRoomChange) {
            Object.keys(server.rooms).forEach((roomKey) => {
              const room = server.rooms[roomKey];
              if (clientId in room.clients) {
                thisClientInstance = room.clients[clientId];
                console.log("Found this guy in some room and removing him");
                delete room.clients[clientId];
              }
              if (roomKey === roomId) roomAlreadyExists = true;
            });

            if (thisClientInstance !== -1) {
              const targetRoom =
                server.rooms[roomId] || server.addRoom(new Room(roomId));
              targetRoom.addClient(thisClientInstance);

              Object.values(targetRoom.clients).forEach((client) => {
                sendEventToClient(
                  { eventName: "destroy_player", clientId },
                  client.socket
                );
              });
              sendEventToClient({ eventName: "changed_room", roomId }, ws);
              UpdateServerInfoOnFirebase(serverId);
            }
          }
        } else {
          console.log("INVALID DATA or SERVER ID");
          sendAlertToClient(
            ws,
            "show",
            "Invalid data or Server ID. Please check your details."
          );
        }

        break;

      case "state_update":
        var submittedServerId = realData.serverId;
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
            //console.log("fully validated")
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
                    // console.log(servers[submittedServerId].rooms[roomKey].clients[clientKey])
                  }
                }
              }
            } else {
              //invalid uid
              console.log("submitted server id is" + submittedServerId);
              console.log(
                "INVALID USER ID in state update or net yet created this customer's server on node"
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
        //console.log(realData);
        var submittedServerId = realData.serverId;
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
            //console.log("fully validated")
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
                    servers[submittedServerId].rooms[roomKey].clients[
                      clientKey
                    ].entities[submittedEntityId] = submittedEntityProperties;
                    // console.log(servers[submittedServerId].rooms[roomKey].clients[clientKey])
                  }
                }
              }
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

      case "SMTC":
        //console.log(realData);
        var submittedServerId = realData.serverId;
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
            //console.log("fully validated")
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
                      }
                    }
                  }
                }
              }
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

      case "destroy_entity":
        // console.log(realData);
        var submittedServerId = realData.serverId;
        var submittedClientId = realData.clientId;

        var submittedEntityId = realData.entityId;
        if (submittedClientId && submittedEntityId && submittedServerId) {
          if (
            typeof submittedClientId == "number" &&
            typeof submittedEntityId == "number" &&
            typeof submittedServerId == "string"
          ) {
            //fully validated
            //console.log("fully validated")
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
                    // console.log(servers[submittedServerId].rooms[roomKey].clients[clientKey])
                  }
                }
              }
            } else {
              //invalid uid
              console.log("submitted server id is" + submittedServerId);
              console.log(
                "INVALID USER ID in state update or net yet created this customer's server on node"
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
        var submittedServerId = realData.serverId;
        if (submittedServerId) {
          if (typeof submittedServerId == "string") {
            if (submittedServerId in servers) {
              sendEventToClient(
                {
                  eventName: "all_rooms",
                  rooms: Object.keys(servers[submittedServerId].rooms),
                },
                ws
              );
            } else {
              //invalid uid
              console.log("INVALID USER ID");
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
        var submittedServerId = realData.serverId;
        if (submittedServerId) {
          if (typeof submittedServerId == "string") {
            if (submittedServerId in servers) {
              var submittedRoomId = realData.roomName;
              if (typeof submittedRoomId == "string") {
                if (submittedRoomId.length != 0) {
                  if (submittedRoomId in servers[submittedServerId].rooms) {
                    sendEventToClient(
                      {
                        eventName: "all_clients",
                        clients: Object.keys(
                          servers[submittedServerId].rooms[submittedRoomId]
                            .clients
                        ),
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

      case "disconnect":
        if (checkServerLevelValidation(realData.serverId)) {
          var submittedServerId = realData.serverId;
          // sendEventToClient({
          //     eventName : "all_rooms",
          //     rooms : Object.keys(servers[submittedServerId].rooms)
          // },ws)
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
              console.log("Found this guy in some room and removing him");
              delete servers[submittedServerId].rooms[roomKey].clients[
                submittedClientId
              ]; //remove this client
            }
          }

          sendEventToClient(
            {
              eventName: "disconnected",
            },
            ws
          );

          ws.close();
        }

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

        break;
    }
  });

  // handling what to do when clients disconnects from server
  ws.on("close", () => {
    console.log("someone disconnected");

    ws.isClosed = true;
  });

  // handling client connection error
  ws.onerror = function () {
    console.log("Some Error occurred");
  };
});
console.log("The WebSocket server is running");

server.listen(process.env.PORT || 3000, () => {
  console.log(`WebSocket server listening on port ${process.env.PORT} `);
});
