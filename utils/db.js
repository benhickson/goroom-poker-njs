const fetch = require('node-fetch');
const { GAMES_ENDPOINT, START_CHIPS } = require('./constants');
const { io } = require('./socketIO');

// tests for emitting to different recepients
// io.sockets.emit('test_messages', 'to everyone');
// socket.emit('test_messages', 'to just me');
// socket.broadcast.emit('test_messages', 'from someone else to everyone else');

// Game fetching and saving helpers

const fetchGame = (room_id) => {
  return fetch(`${GAMES_ENDPOINT}?room_id=${room_id}`)
    .then(r => r.json())
}

const fetchOrCreateGameAndThenCallback = (room_id, user_id, callbackFn) => {
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
        return player;
      } else {
        player.cards = ['back', 'back']
        return player;
      }
    });

    // empty the deck array so they can't see what cards are left
    game.deck = []
  }

  return game;
}

const getNewGame = (room_id, creator_id) => {
  return {
    // "id": null, // created by database
    "started": false,
    "room_id": room_id,
    "created_at": Date.now(),
    "created_by": creator_id,
    "pending_players": [],
    "players": [],
    "pot": 0,
    "deck": [],
    "board_cards": [],
    "dealer": 0,            // zeroes instead of nulls, to reset things on the frontend.
    "next_player": 0,         // likely better to manage this in the frontend.
    "max_bet_for_hand": null,
    "max_bet_next_player": null,
    "bet_leader": null,
    "stage": 0,
    "big_blind": START_CHIPS.big_blind,
    "small_blind": START_CHIPS.small_blind,
    "amount_to_stay": 0,
    "cost_to_call": 0,
    "turn_options": null,     // 'before-bets','after-bets','end-not-called'
    "hand_winners": [],
    "game_winner": null,
  }
};

const createNewGame = (room_id, creator_id) => {
  console.log('user', creator_id, 'is creating game for room', room_id)
  return fetch(GAMES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(getNewGame(room_id, creator_id))
  })
    .then(r => r.json())
}

// patch and emit the updated game to everyone
const patchAndEmitGame = (gameId, gamePatchObject) => {
  fetch(`${GAMES_ENDPOINT}/${gameId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(gamePatchObject)
  })
    .then(r => r.json())
    .then(game => {
      // emit the updated game state to everyone
      io.sockets.to(`room_${game.room_id}`).emit('game_state', game);
    });
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
    .then(game => {
      // notify everyone that a new private state is available
      io.sockets.to(`room_${game.room_id}`).emit('private_state_available');
    });
}

module.exports = { 
  fetchOrCreateGameAndThenCallback, 
  filterGameState, 
  createNewGame, 
  patchAndEmitGame, 
  patchGameAndEmitPrivateAvailability,
  getNewGame,
};
