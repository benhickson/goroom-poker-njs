// Constants
const GAMES_ENDPOINT = (process.env.NODE_ENV === "production") ? 'https://goroom-poker-jsonserver.herokuapp.com/games' : 'http://localhost:3004/games';
const START_CHIPS = {
  player_stack: 200,
  big_blind: 5,
  small_blind: 2.50
};

module.exports = { GAMES_ENDPOINT, START_CHIPS };
