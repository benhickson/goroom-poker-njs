// import the cards helpers
const cards = require('./cards');

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

const advancePlayerOrStage = game => {
  // if the next player is the bet leader, that means they have been called, and the game can advance, otherwise not
  const nextStage = (nextPlayer(game) === game.bet_leader) ? game.stage + 1 : game.stage;

  // if the game stage advances, set the next player to the left of dealer, otherwise, get the regular next player
  const nextPlayerId = (nextStage > game.stage) ? nextPlayer(game, game.dealer) : nextPlayer(game);

  // TODO: deal with when all the other users fold, auto advancing to game.stage=5 to declare the winner

  // set the cost to call based on the amount_to_stay minus the next player's current_stage_bet
  const costForNextPlayerToCall = game.amount_to_stay - game.players.find(player => player.id === nextPlayerId).current_stage_bet;
  console.log(nextPlayerId, nextStage, costForNextPlayerToCall);
  return [nextPlayerId, nextStage, costForNextPlayerToCall];
}

const modifyGameStateToAdvanceStage = (game) => {

  console.log('modify state', game.stage);

  // NOTE: game.stage must already be set to the next stage before calling this function

  // load the deck into its local variable, so cards.drawCard() can work properly
  cards.setDeck(game.deck);

  switch (game.stage) {
    case 2: // flop
      game.board_cards = [cards.drawCard(), cards.drawCard(), cards.drawCard()];
      break;
    case 3: // turn
      game.board_cards = [...game.board_cards, cards.drawCard()];
      break;
    case 4: // river
      game.board_cards = [...game.board_cards, cards.drawCard()];
      break;
    case 5: // end/winner
      game.hand_winners = determineWinners(game);
      break;
    default:
      break;
  }

  game.players = game.players.map(player => {
    player.current_stage_bet = 0;
    return player;
  })
  game.amount_to_stay = 0;
  game.cost_to_call = 0;
  game.bet_leader = null;
  game.turn_options = 'before-bets';

  // save the deck back to its game
  game.deck = cards.getDeck();

  return game;
}

const finishTurn = (game) => {
  // advance the next player/stage
  const [nextPlayer, nextStage, costForNextPlayerToCall] = advancePlayerOrStage(game);
  game.next_player = nextPlayer;
  game.cost_to_call = costForNextPlayerToCall;
  // if the stage advanced, update accordingly
  if (nextStage > game.stage) {
    game.stage = nextStage;
    game = modifyGameStateToAdvanceStage(game);
  }
  return game;
}

module.exports = { 
  nextDealer, 
  bigAndSmallBlindPlayerIds, 
  nextPlayer, 
  advancePlayerOrStage, 
  modifyGameStateToAdvanceStage,
  finishTurn,
};
