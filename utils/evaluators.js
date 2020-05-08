const PokerEvaluator = require('./poker-evaluator-0.3.2');

// game-specific poker helpers

const determineWinners = game => {
  return [{ id: game.players[0].id, display_name: game.players[0].display_name }];
}
// call this in the above case: 5, and loop/map over it to pay the players
const payoutsForWinners = (game, winners) => {
  const amountToPayEach = (game.pot / winners.length).toFixed(2);
  return [{ id: game.players[0].id, payout_amount: amountToPayEach }];
}

// example evaluation, array of board and array of hand
// PokerEvaluator.evalHand(evalMap([...board, ...hand1]))
