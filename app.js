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

// // Database
// const db = new sqlite3.Database('./db/development.db', (err) => {
//   if (err) {
//     console.error(err.message);
//   }
//   console.log('Connected to the development database.');
// });

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
}
const suitEvalMap = {
    'clubs': 'c',
    'diamonds': 'd',
    'hearts': 'h',
    'spades': 's',
}
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
};
const freshenTheDeck = () => {
    deck = [...freshDeck];
};

const createOrSelectGame = (room_id) => {
  const GAMES_ENDPOINT = 'http://localhost:3004/games'
  return fetch(`${GAMES_ENDPOINT}?room_id=${room_id}`)
          .then(r => r.json())
}

const filterGameState = (game, user_id) => {
  game.players = game.players.map(player => {
    if (player.id === user_id) {
        return player
    } else {
        player.cards = ['back','back']
        return player
    }
  });

  return game;
}

// Socket.io listener
io.on('connect', (socket) => {

    // tests for emitting to different recepients
    io.sockets.emit('test_messages', 'to everyone');
    socket.emit('test_messages', 'to just me');
    socket.broadcast.emit('test_messages', 'from someone else to everyone else');

    // get user details from JWT
    const jwtPayload = jwtDecode(socket.handshake.headers.authorization);        // TODO: verify signature is from Rails
    const user_id = jwtPayload.user_id;
    const user_name = jwtPayload.user_name;
    
    // get the goroom room_id from query params
    room_id = parseInt(socket.handshake.query.room_id)

    // get the game from db and send it to the player
    createOrSelectGame(room_id)
      .then(game => {
        socket.emit('test_messages', filterGameState(game[0], user_id));
      });
    
    

    // log something
    console.log('User connected:', user_id, user_name, 'in room:', room_id);

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
        freshenTheDeck();
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
