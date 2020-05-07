// requires
const express = require('express');
// const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const jwtDecode = require('jwt-decode');
const SocketIO = require('socket.io');
const PokerEvaluator = require('./poker-evaluator-0.3.2');

// Express
const app = express();
app.set('view engine', 'ejs')
app.use(express.static('public'));
app.get('/', (req, res) => {
	res.render('index')
})
server = app.listen(5000)

// Socket.io
const io = SocketIO(server, {
    // all this is required for cross-origin issues
    handlePreflightRequest: (req, res) => {
        const headers = {
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin you want to give access to,
            "Access-Control-Allow-Credentials": true
        };
        res.writeHead(200, headers);
        res.end();
    }
});

// Constants
const GAMES_ENDPOINT = 'http://localhost:3004/games';
const START_CHIPS = {
  player_stack: 200,
  big_blind: 5,
  small_blind: 2.50
};

// My poker helpers
const freshDeck = ['ace clubs','two clubs','three clubs','four clubs','five clubs','six clubs','seven clubs','eight clubs','nine clubs','ten clubs','jack clubs','queen clubs','king clubs','ace diamonds','two diamonds','three diamonds','four diamonds','five diamonds','six diamonds','seven diamonds','eight diamonds','nine diamonds','ten diamonds','jack diamonds','queen diamonds','king diamonds','ace hearts','two hearts','three hearts','four hearts','five hearts','six hearts','seven hearts','eight hearts','nine hearts','ten hearts','jack hearts','queen hearts','king hearts','ace spades','two spades','three spades','four spades','five spades','six spades','seven spades','eight spades','nine spades','ten spades','jack spades','queen spades','king spades'];
const numberEvalMap = {
    'ace': 'a',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8',
    'nine': '9',
    'ten': 't',
    'jack': 'j',
    'queen': 'q',
    'king': 'k',
};
const suitEvalMap = {
    'clubs': 'c',
    'diamonds': 'd',
    'hearts': 'h',
    'spades': 's',
};
const evalMap = (cards) => {
    return cards.map(card => {
        const numberSuit = card.split(' ');
        const number = numberEvalMap[numberSuit[0]];
        const suit = suitEvalMap[numberSuit[1]];
        return [number, suit].join('');
    });
}
let deck = null;
const drawCard = () => {
    const randomCardIndex = Math.floor((Math.random() * deck.length))
    const randomCardString = deck[randomCardIndex];

    deck.splice(randomCardIndex, 1);
    
    return randomCardString;
}
const shuffleTheDeck = () => {
    deck = [...freshDeck];
}

// Dealer and player rotation

const nextDealer = (game) => {
  const currentDealer = game.dealer;
  const sortedPlayerIdList = game.players.filter(player => !player.out)
                                        .sort((a, b) => a.position - b.position)
                                        .map(player => player.id);
  const currentIndex = sortedPlayerIdList.indexOf(currentDealer);
  const nextIndex = (currentIndex + 1 >= sortedPlayerIdList.length)
                    ? 0
                    : currentIndex + 1;
  return sortedPlayerIdList[nextIndex];
}

const bigAndSmallBlindPlayerIds = (game) => {
  const currentDealer = game.dealer;
  const sortedPlayerIdList = game.players.filter(player => !player.out)
                                        .sort((a, b) => a.position - b.position)
                                        .map(player => player.id);
  const currentDealerIndex = sortedPlayerIdList.indexOf(currentDealer);
  const smallBlindIndex = (currentDealerIndex + 1 >= sortedPlayerIdList.length)
                          ? 0
                          : currentDealerIndex + 1;
  const bigBlindIndex = (smallBlindIndex + 1 >= sortedPlayerIdList.length)
                        ? 0
                        : smallBlindIndex + 1;
  return [sortedPlayerIdList[smallBlindIndex], sortedPlayerIdList[bigBlindIndex]];
}

const nextPlayer = (game, lastPlayerId = game.next_player) => {
  const sortedPlayerIdList = game.players.filter(player => !player.out)
                                        .sort((a, b) => a.position - b.position)
                                        .map(player => player.id);
  const lastPlayerIndex = sortedPlayerIdList.indexOf(lastPlayerId);
  const nextPlayerIndex = (lastPlayerIndex + 1 >= sortedPlayerIdList.length)
                          ? 0
                          : lastPlayerIndex + 1;
  return sortedPlayerIdList[nextPlayerIndex];
}

const advancePlayerOrStage = (game) => {
  // if the next player is the bet leader, that means they have been called, and the game can advance, otherwise not
  const nextStage = (nextPlayer(game) === game.bet_leader) ? game.stage + 1 : game.stage;
  // if the game advances, set the next player to the left of dealer, otherwise, get the regular next player
  const nextPlayerId = (nextStage > lastStage) ? nextPlayer(game, game.dealer) : nextPlayer(game);
  return [nextPlayerId, nextStage];
}


// Game fetching and saving helpers

const fetchGame = (room_id) => {  
  return fetch(`${GAMES_ENDPOINT}?room_id=${room_id}`)
          .then(r => r.json())
}

fetchOrCreateGameAndThenCallback = (room_id, user_id, callbackFn) => {
  // get the game from db and send it to the player
  fetchGame(room_id)
  .then(game => {
    if (game.length === 1) {
      callbackFn(game);
    } else if (game.length === 0) {
      console.log('game for room', room_id, 'does not yet exist');
      createNewGame(room_id, user_id)
        .then(() => {
          fetchOrCreateGameAndThenCallback(room_id, user_id, callbackFn);
        });
    } else {
      console.log('ERROR: more than one game was returned for room', room_id)
    }
  });
}

const filterGameState = (game, user_id) => {
  // not sure why, but for some reason sometimes game is undefined
  // so, we wrap it in this if block to prevent errors
  if (game && game.started) {
    // only show the player their own cards
    game.players = game.players.map(player => {
      if (player.id === user_id) {
        return player
      } else {
        player.cards = ['back','back']
        return player
      }
    });
    
    // empty the deck array so they can't see what cards are left
    game.deck = []
  }
  
  return game;
}

const createNewGame = (room_id, creator_id) => {
  console.log('user', creator_id, 'is creating game for room', room_id)
  const newGame = {
    // "id": null, // created by database
    "started": false,
    "room_id": room_id,
    "created_at": Date.now(),
    "created_by": creator_id,
    "pending_players": [],
    "players": [],
    "pot": 0,
    "board_cards": [],
    "dealer": 0,            // zeroes instead of nulls, to reset things on the frontend.
    "next_player": 0,         // likely better to manage this in the frontend.
    "bet_leader": null,
    "stage": 0,
    "big_blind": START_CHIPS.big_blind,
    "small_blind": START_CHIPS.small_blind,
    "amount_to_stay": null,
    "cost_to_call": null,
    "turn_options": "before-bets"
  };
  return fetch(GAMES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newGame)
  })
    .then(r => r.json())
}

// patch a game and emit signal to request private game state
const patchGameAndEmitPrivateAvailability = (gameId, gamePatchObject) => {
  fetch(`${GAMES_ENDPOINT}/${gameId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(gamePatchObject)
  })
    .then(r => r.json())
    .then(() => {
      // notify everyone that a new private state is available
      io.sockets.emit('private_state_available');
    });
}

// Socket.io listener

io.on('connect', (socket) => {

    // tests for emitting to different recepients
    // io.sockets.emit('test_messages', 'to everyone');
    // socket.emit('test_messages', 'to just me');
    // socket.broadcast.emit('test_messages', 'from someone else to everyone else');

    // get user details from JWT
    const jwtPayload = jwtDecode(socket.handshake.headers.authorization);        // TODO: verify signature is from Rails
    const user_id = jwtPayload.user_id;
    const user_name = jwtPayload.user_name;
    
    // get the goroom room_id from query params
    room_id = parseInt(socket.handshake.query.room_id)

    // log the connection
    console.log('User connected:', user_id, user_name, 'in room:', room_id);

    // send the game state to the user on connect (async)
    fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      socket.emit('game_state', filterGameState(gameArray[0], user_id));
    });

    socket.on('join_game', () =>{
      fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
        const game = gameArray[0]
        if (game.started) {
          // do nothing, you can't add players after the game has started
          // TODO: emit an "illegal move" message
        } else {
          // if the user is in the game already
          if (game.pending_players.map(player => player.id).includes(user_id)) {
            // send the game state back to them
            socket.emit('game_state', game);
          } else {
            // add them to the pending players array
            game.pending_players = [...game.pending_players, {id: user_id, display_name: user_name}];
            fetch(`${GAMES_ENDPOINT}/${game.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ pending_players: game.pending_players })
            })
              .then(r => r.json())
              .then(game => {
                // emit the updated game state to everyone
                io.sockets.emit('game_state', game);
              });
          }
        }
      });
    });

    socket.on('disconnect', (reason) => {
      fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
        const game = gameArray[0];
        if (game.started) {
          // do nothing, it doesnt matter if you left the game, you can just re-join
          // TODO: emit some message to let the other players know you went offline
        } else {
          // remove the user from the pending players array
          game.pending_players = game.pending_players.filter(player => player.id != user_id);
          fetch(`${GAMES_ENDPOINT}/${game.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pending_players: game.pending_players })
          })
            .then(r => r.json())
            .then(game => {
              // emit the updated game state to everyone
              io.sockets.emit('game_state', game);
            })
        }
      })
    });

    socket.on('start_game', () => {
      fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
        const game = gameArray[0];
        if (game.started) {
          console.log('Already-started game in room', room_id, 'was attempted to start');
        } else {
          // Start the game
          game.started = true;
          game.players = game.pending_players.map((player, index) => ({
            id: player.id,
            position: (index + 1),
            display_name: player.display_name,
            chips: START_CHIPS.player_stack,
            cards: [],
            current_stage_bet: 0,
            folded: false,
            out: false
          }));    

          // save it back to the database
          fetch(`${GAMES_ENDPOINT}/${game.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ started: game.started, players: game.players })
          })
            .then(r => r.json())
            .then(game => {
              // emit the updated game state to everyone
              io.sockets.emit('game_state', game);
            });
        }
      });
    });

    socket.on('deal_cards', () => {
      console.log('dealing cards in room', room_id);
      fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
        const game = gameArray[0];
        // check if cards already dealt
        if (game.stage > 0) {
          console.log('Already-dealt round in room', room_id, 'was asked to deal');
        } else {
          // assign the dealer
          game.dealer = nextDealer(game);
          // shuffle the deck
          shuffleTheDeck();
          // find the big and small blind player id's
          const [smallBlindPlayerId, bigBlindPlayerId] = bigAndSmallBlindPlayerIds(game);

          // collect blinds and deal the cards
          game.players = game.players
            .filter(player => !player.out)
            .map(player => {
              if (player.id === smallBlindPlayerId) {
                // collect the small blind
                player.chips = player.chips - game.small_blind;
              } else if (player.id === bigBlindPlayerId) {
                // collect the big blind
                player.chips = player.chips - game.big_blind;
              }
              // deal the cards
              player.cards = [drawCard(), drawCard()];

              return player
            });

          // pay the blinds into the pot
          game.pot = game.big_blind + game.small_blind;

          // make the big blind player the bet leader
          game.bet_leader = bigBlindPlayerId;

          // determine whose turn it is next
          game.next_player = nextPlayer(game, bigBlindPlayerId);

          // patch the game
          patchGameAndEmitPrivateAvailability(game.id, {
            dealer: game.dealer, 
            players: game.players, 
            pot: game.pot,
            deck: deck,
            stage: 1,
            bet_leader: game.bet_leader,
          });
        }
      });
    });

    socket.on('private_game_state_request', () => {
      fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
        socket.emit('game_state', filterGameState(gameArray[0], user_id));
      });
    });

    socket.on('user_move', (move) => {
      // fetch the game
      fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
        const game = gameArray[0];
        if (!game.started || game.next_player != user_id){
          console.log('room', room_id, 'user', user_id, 'attempted:', move.type, 'but it isn\'t their turn');
        } else {
          if (game.turn_options === 'before-bet') {
            // move options before a bet has been made
            if (move.type == 'fold') {
              // fold the player
              game.players = game.players.map(player => {
                if (player.id === user_id) {
                  player.folded = true;
                }
                return player
              });
              // advance the player and/or stage
              const [nextPlayer, nextStage] = advancePlayerOrStage(game);
              // patch the game
              patchGameAndEmitPrivateAvailability(game.id, {
                players: game.players,
                nextPlayer: nextPlayer,
                stage: nextStage,
              });
            } else if (move.type == 'check') {
            
            } else if (move.type == 'bet') {
            
            } else {
              console.log('room', room_id, 'user', user_id, 'attempted invalid move type:', move.type);
              return null
            }
          } else if (game.turn_options === 'after-bet') {
            // move options after a bet has been made
            if (move.type == 'fold') {
              // is it a valid turnOption
            } else if (move.type == 'call') {
            
            } else if (move.type == 'raiseBet') {
              
            } else {
              console.log('room', room_id, 'user', user_id, 'attempted invalid move type:', move.type);
              return null
            }
          } else if (game.turn_options === 'end-not-called') {
            // move options at the end of a round/hand if a user has not been called, but is still playing
            if (move.type == 'showCards') {
            
            } else if (move.type == 'muckCards') {
              
            } else {
              console.log('room', room_id, 'user', user_id, 'attempted invalid move type:', move.type);
              return null
            }
          }
            
          console.log('room', room_id, 'user', user_id, 'attempted', move.type);
        }
      });
    });

    // get game from db based on room_id, if it exists
    // if room_id in games:
    //     game = games[room_id]
    //     //# check if game is already started
    //     if game['started'] == True:
    //         //# if so, check if the user is in the game, and can re-join
    //         filtered_player_list = [player for player in game['pending_player_list'] if player['id'] == user_id]
    //         if len(filtered_player_list) == 1:
    //             //# allow the user to re-join
    //             print('User ' + str(user_id) + ' is re-joining the game for room ' + str(room_id))
    //             //# send the game state
    //             //# emit('update_game_state', game['game'].get_game_state())
    //             //# trigger client to request private game state
    //             emit('private_state_available')
    //         else:
    //             //# user not allowed in this game
    //             print('User ' + str(user_id) + ' attemped to join the game for room ' + str(room_id))
    //     else:
    //         //# if game exists, but has not started, add user to the list of pending players
    //         game['pending_player_list'].append({'id': user_id, 'displayName': user_name})
    //         //# emit the message with the updated player list
    //         emit('players_joined', {'pendingPlayerList': games[room_id]['pending_player_list'], 'room_id': room_id}, broadcast=True)
    // else:
    //     //# if game doesn't exist, create it, and add user to the list of pending players  
    //     games[room_id] = {
    //         'started': False,
    //         'pending_player_list': [{'id': user_id, 'displayName': user_name}]
    //     }
    //     //# emit the message with the player list
    //     emit('players_joined', {'pendingPlayerList': games[room_id]['pending_player_list'], 'room_id': room_id}, broadcast=True)


	//default username
	socket.username = "Anonymous"

    //listen on change_username
    socket.on('change_username', (data) => {
        socket.username = data.username
    })

    //listen on new_message
    socket.on('new_message', (data) => {
        shuffleTheDeck();
        const board = [drawCard(), drawCard(), drawCard(), drawCard(), drawCard()];
        const hand1 = [drawCard(), drawCard()];
        const hand2 = [drawCard(), drawCard()];
        const hand3 = [drawCard(), drawCard()];
        const eval1 = PokerEvaluator.evalHand(evalMap([...board, ...hand1]));
        const eval2 = PokerEvaluator.evalHand(evalMap([...board, ...hand2]));
        const eval3 = PokerEvaluator.evalHand(evalMap([...board, ...hand3]));
        const length = deck.length;
        //broadcast the new message
        // io.sockets.emit('new_message', {message : data.message, username : socket.username});
        const response = {
            name1: eval1.handName,
            rank1: eval1.value,
            name2: eval2.handName,
            rank2: eval2.value,
            name3: eval3.handName,
            rank3: eval3.value,
            hand1: hand1, 
            hand2: hand2, 
            hand3: hand3, 
            board: board, 
        }
        io.sockets.emit('new_message', {message : JSON.stringify(response), username : socket.username});
        // socket.emit('an event', 'hi')
    })

    //listen on typing
    socket.on('typing', (data) => {
    	socket.broadcast.emit('typing', {username : socket.username})
    })
})


// Close the database
// db.close((err) => {
//   if (err) {
//     console.error(err.message);
//   }
//   console.log('Database closed.');
// });
