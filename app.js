const { io } = require('./utils/socketIO');
const { START_CHIPS } = require('./utils/constants');
const rotations = require('./utils/rotations');
const cards = require('./utils/cards');
const db = require('./utils/db');
const pokerMethods = require('./utils/pokerMethods');

const jwtDecode = require('jwt-decode');

// Socket.io listener

io.on('connect', (socket) => {

  // get user details from JWT
  const jwtPayload = jwtDecode(socket.handshake.headers.authorization);        // TODO: verify signature is from Rails
  const user_id = jwtPayload.user_id;
  const user_name = jwtPayload.user_name;

  // get the goroom room_id from query params
  const room_id = parseInt(socket.handshake.query.room_id);

  // join channel for this room
  socket.join(`room_${room_id}`);

  // log the connection
  console.log('User connected:', user_id, user_name, 'in room:', room_id);

  // send the game state to the user on connect (async)
  db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
    socket.emit('game_state', db.filterGameState(gameArray[0], user_id));
  });

  socket.on('join_game', () => {
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
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
          game.pending_players = [...game.pending_players, { id: user_id, display_name: user_name }];
          // patch game in db and emit to everyone
          db.patchAndEmitGame(game.id, { pending_players: game.pending_players });
        }
      }
    });
  });

  socket.on('disconnect', (reason) => {
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      const game = gameArray[0];
      if (game.started) {
        // do nothing, it doesnt matter if you left the game, you can just re-join
        // TODO: emit some message to let the other players know you went offline
      } else {
        // remove the user from the pending players array
        game.pending_players = game.pending_players.filter(player => player.id != user_id);
        // patch game in db and emit to everyone
        db.patchAndEmitGame(game.id, { pending_players: game.pending_players });
      }
    });
  });

  socket.on('start_game', () => {
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
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
          show_cards: false,
          current_stage_bet: 0,
          current_hand_bet: 0,
          folded: false,
          out: false
        }));

        // save it back to the database
        db.patchAndEmitGame(game.id, { started: game.started, players: game.players });
      }
    });
  });

  socket.on('reset_game', () => {
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      const game = gameArray[0];
      // if there's a game winner, the game can be reset
      if (game.game_winner) {
        console.log('resetting game in room', room_id);
        db.patchAndEmitGame(game.id, db.getNewGame(room_id, user_id));
      }
    });
  });

  socket.on('deal_cards', () => {
    console.log('dealing cards in room', room_id);
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      let game = gameArray[0];
      // check if cards already dealt
      if (game.stage > 0 && game.stage < 5) {
        console.log('Already-dealt round in room', room_id, 'was asked to deal by player', user_id);
      } else {
        // set the hand's max bet - the "All-in" limit
        // TODO: this will need to be more complex in the case of side pots
        game.max_bet_for_hand = pokerMethods.getSmallestChipStackAmount(game);

        // assign the dealer
        game.dealer = rotations.nextDealer(game);
        // shuffle the deck
        cards.shuffleTheDeck();
        // find the big and small blind player id's
        const [smallBlindPlayerId, bigBlindPlayerId] = rotations.bigAndSmallBlindPlayerIds(game);

        // collect the blinds
        game = pokerMethods.placeBet(game, smallBlindPlayerId, game.small_blind);
        game.cost_to_call = game.small_blind;
        game = pokerMethods.placeBet(game, bigBlindPlayerId, game.big_blind);
        

        // deal the cards
        game.players = game.players
          .map(player => {
            // hide cards from other players
            player.show_cards = false;
            // clear any cards from the prior hands
            player.cards = [];
            return player;
          })
          .filter(player => !player.out)
          .map(player => {
            // deal the cards
            player.cards = [cards.drawCard(), cards.drawCard()];
            player.folded = false;

            return player;
          });
        
        // save the deck back after dealing
        game.deck = cards.getDeck();
        
        // determine whose turn it is next
        game.next_player = rotations.nextPlayer(game, bigBlindPlayerId);
        game.cost_to_call = game.amount_to_stay - game.players.find(player => player.id === game.next_player).current_stage_bet;
        game.max_bet_next_player = pokerMethods.getMaxBetForNextPlayer(game);

        game.stage = 1;

        // reset any winners from the prior hand
        game.hand_winners = [];
        // reset the board cards from the prior hand
        game.board_cards = [];

        // patch the game
        db.patchGameAndEmitPrivateAvailability(game.id, game);
      }
    });
  });

  socket.on('private_game_state_request', () => {
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      socket.emit('game_state', db.filterGameState(gameArray[0], user_id));
    });
  });

  socket.on('user_move', (move) => {
    // fetch the game
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      let game = gameArray[0];
      if (!game.started || game.next_player != user_id) {
        console.log('room', room_id, 'user', user_id, 'attempted', move.type, 'but it isn\'t their turn');
      } else {
        console.log('room', room_id, 'user', user_id, 'is attempting to', move.type);
        if (game.turn_options === 'before-bets') {
          // move options before a bet has been made
          if (move.type == 'fold') {

            // fold the player
            game.players = game.players.map(player => {
              if (player.id === user_id) {
                player.folded = true;
              }
              return player
            });
            // advance the next player/stage
            game = rotations.finishTurn(game);
            // patch the game states
            db.patchGameAndEmitPrivateAvailability(game.id, game);

          } else if (move.type == 'check') {

            if (!game.bet_leader) {
              game.bet_leader = user_id;
            }
            // advance the player and/or stage
            game = rotations.finishTurn(game);
            // patch the game states
            db.patchGameAndEmitPrivateAvailability(game.id, game);

          } else if (move.type == 'bet') {

            // if the bet is within the maximum bet
            if (move.amount <= game.max_bet_next_player) {
              console.log('bet allowed')
              // place the bet
              game = pokerMethods.placeBet(game, user_id, move.amount);
              // advance the next player/stage
              game = rotations.finishTurn(game);
            } else {
              console.log('bet too high')
            }

            // patch and emit the game state
            db.patchGameAndEmitPrivateAvailability(game.id, game);

          } else {
            console.log('room', room_id, 'user', user_id, 'attempted invalid move type:', move.type);
            return null
          }
        } else if (game.turn_options === 'after-bets') {
          // move options after a bet has been made
          if (move.type == 'fold') {

            // fold the player
            game.players = game.players.map(player => {
              if (player.id === user_id) {
                player.folded = true;
              }
              return player
            });
            // advance the next player/stage
            game = rotations.finishTurn(game);
            // patch the game states
            db.patchGameAndEmitPrivateAvailability(game.id, game);

          } else if (move.type == 'call') {

            // place the bet
            game = pokerMethods.placeBet(game, user_id, game.cost_to_call);
            // advance the next player/stage
            game = rotations.finishTurn(game);
            // patch the game states
            db.patchGameAndEmitPrivateAvailability(game.id, game);

          } else if (move.type == 'raiseBet') {

            // if the bet is within the maximum bet
            if (move.amount <= game.max_bet_next_player) {
              console.log('bet allowed')
              // place the bet
              game = pokerMethods.placeBet(game, user_id, move.amount);
              // advance the next player/stage
              game = rotations.finishTurn(game);
            } else {
              console.log('bet too high')
            }
            // patch the game states
            db.patchGameAndEmitPrivateAvailability(game.id, game);

          } else {
            console.log('room', room_id, 'user', user_id, 'attempted invalid move type:', move.type);
            return null;
          }
        } else if (game.turn_options === 'end-not-called') {
          // move options at the end of a round/hand if a user has not been called, but is still playing
          if (move.type == 'showCards') {

          } else if (move.type == 'muckCards') {

          } else {
            console.log('room', room_id, 'user', user_id, 'attempted invalid move type:', move.type);
            return null;
          }
        }
      }
    });
  });
});
