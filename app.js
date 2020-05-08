const { io } = require('./utils/socketIO');
const { START_CHIPS } = require('./utils/constants');
const rotations = require('./utils/rotations');
const cards = require('./utils/cards');
const db = require('./utils/db');

const jwtDecode = require('jwt-decode');

// Socket.io listener

io.on('connect', (socket) => {

  // get user details from JWT
  const jwtPayload = jwtDecode(socket.handshake.headers.authorization);        // TODO: verify signature is from Rails
  const user_id = jwtPayload.user_id;
  const user_name = jwtPayload.user_name;

  // get the goroom room_id from query params
  room_id = parseInt(socket.handshake.query.room_id)

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
    })
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
          current_stage_bet: 0,
          folded: false,
          out: false
        }));

        // save it back to the database
        db.patchAndEmitGame(game.id, { started: game.started, players: game.players });
      }
    });
  });

  socket.on('deal_cards', () => {
    console.log('dealing cards in room', room_id);
    db.fetchOrCreateGameAndThenCallback(room_id, user_id, (gameArray) => {
      const game = gameArray[0];
      // check if cards already dealt
      if (game.stage > 0) {
        console.log('Already-dealt round in room', room_id, 'was asked to deal');
      } else {
        // assign the dealer
        game.dealer = rotations.nextDealer(game);
        // shuffle the deck
        cards.shuffleTheDeck();
        // find the big and small blind player id's
        const [smallBlindPlayerId, bigBlindPlayerId] = rotations.bigAndSmallBlindPlayerIds(game);

        // collect blinds and deal the cards
        game.players = game.players
          .filter(player => !player.out)
          .map(player => {
            if (player.id === smallBlindPlayerId) {
              // collect the small blind
              player.chips = player.chips - game.small_blind;
              player.current_stage_bet = game.small_blind;
            } else if (player.id === bigBlindPlayerId) {
              // collect the big blind
              player.chips = player.chips - game.big_blind;
              player.current_stage_bet = game.big_blind;
            }
            // deal the cards
            player.cards = [cards.drawCard(), cards.drawCard()];

            return player
          });

        // pay the blinds into the pot
        game.pot = game.big_blind + game.small_blind;
        // make the big blind player the bet leader
        game.bet_leader = bigBlindPlayerId;
        // TODO: calculate this based on bet leader
        game.amount_to_stay = game.big_blind;

        // blinds counts as betting, so the turn options are 'after-bets'
        game.turn_options = 'after-bets';
        
        // determine whose turn it is next
        game.next_player = rotations.nextPlayer(game, bigBlindPlayerId);
        game.cost_to_call = game.amount_to_stay - game.players.find(player => player.id === game.next_player).current_stage_bet;

        game.stage = 1;

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
      const game = gameArray[0];
      if (!game.started || game.next_player != user_id) {
        console.log('room', room_id, 'user', user_id, 'attempted:', move.type, 'but it isn\'t their turn');
      } else {
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

            // advance the player and/or stage
            const [nextPlayer, nextStage, costForNextPlayerToCall] = rotations.advancePlayerOrStage(game);

            // if the stage advanced, update the game state accordingly
            if (nextStage > game.stage) {
              game.next_player = nextPlayer;
              game.stage = nextStage;
              game.cost_to_call = costForNextPlayerToCall;
              modifiedGame = rotations.modifyGameStateToAdvanceStage(game);
              // patch the changed game states
              db.patchGameAndEmitPrivateAvailability(game.id, {
                ...modifiedGame
              });
            } else {
              // patch the changed game states
              db.patchGameAndEmitPrivateAvailability(game.id, {
                players: game.players,
                nextPlayer: nextPlayer,
                cost_to_call: costForNextPlayerToCall,
                stage: nextStage,
              });
            }

          } else if (move.type == 'check') {
            // advance the player and/or stage
            const [nextPlayer, nextStage, costForNextPlayerToCall] = rotations.advancePlayerOrStage(game);

            console.log(nextPlayer, nextStage, costForNextPlayerToCall);
            io.sockets.emit('test_messages', game);

            // if the stage advanced, update the game state accordingly
            // if (nextStage > game.stage) {
            //   game.next_player = nextPlayer;
            //   game.stage = nextStage;
            //   game.cost_to_call = costForNextPlayerToCall;
            //   modifiedGame = rotations.modifyGameStateToAdvanceStage(game);
            //   // patch the changed game states
            //   console.log('advance to stage:', nextStage);
            //   db.patchGameAndEmitPrivateAvailability(game.id, modifiedGame);
            // } else {
            //   // player becomes the bet_leader if there isn't one yet (if someone else didn't already check)
            //   if (!game.bet_leader) {
            //     game.bet_leader = user_id;
            //   }
            //   console.log('no advance, stage still:', nextStage);
            //   // patch the changed game states
            //   db.patchGameAndEmitPrivateAvailability(game.id, {
            //     bet_leader: game.bet_leader,
            //     next_player: nextPlayer,
            //     cost_to_call: costForNextPlayerToCall,
            //   });
            // }
          } else if (move.type == 'bet') {

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

            // advance the player and/or stage
            const [nextPlayer, nextStage, costForNextPlayerToCall] = rotations.advancePlayerOrStage(game);

            // if the stage advanced, update the game state accordingly
            if (nextStage > game.stage) {
              game.next_player = nextPlayer;
              game.stage = nextStage;
              game.cost_to_call = costForNextPlayerToCall;
              modifiedGame = rotations.modifyGameStateToAdvanceStage(game);
              // patch the changed game states
              db.patchGameAndEmitPrivateAvailability(game.id, {
                ...modifiedGame
              });
            } else {
              // patch the changed game states
              db.patchGameAndEmitPrivateAvailability(game.id, {
                players: game.players,
                nextPlayer: nextPlayer,
                cost_to_call: costForNextPlayerToCall,
                stage: nextStage,
              });
            }
          } else if (move.type == 'call') {

          } else if (move.type == 'raiseBet') {

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

        console.log('room', room_id, 'user', user_id, 'attempted', move.type);
      }
    });
  });
});
