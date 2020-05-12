const PokerEvaluator = require('../poker-evaluator-0.3.2');
const cards = require('./cards');

// pure poker logic

const payoutsForWinners = (game) => {
  const amountToPayEach = parseFloat((game.pot / game.hand_winners.length).toFixed(2));
  return [{ user_id: game.players[0].id, payout_amount: amountToPayEach }];
}

const endHand = game => {
  const scores = []
  game.players.forEach(player => {
    const evaluation = PokerEvaluator.evalHand(cards.evalMap([
      ...game.board_cards,
      ...player.cards
    ]));
    scores.push({
      id: player.id,
      display_name: player.display_name,
      score: evaluation.value,
      hand_name: evaluation.handName
    });
  });
  let winnerArray = [];
  scores.forEach(score => {
    if (winnerArray.length === 0) {
      winnerArray = [score];
    } else if (score.score > winnerArray[0].score) {
      winnerArray = [score];
    } else if (score.score === winnerArray[0].score) {
      winnerArray.push(score);
    }
  });
  game.hand_winners = winnerArray;
  payouts = payoutsForWinners(game);
  game.pot = 0;
  payouts.forEach(payout => {
    game.players.forEach(player => {
      if (player.id === payout.user_id) {
        player.chips += payout.payout_amount;
      }
    });
  });
  game.next_player = null;          // TODO: using this to hide the action buttons... there is possibly a better, more semantic way to do this.
  return game;
}

// example evaluation, array of board and array of hand
// PokerEvaluator.evalHand(evalMap([...board, ...hand1]))

const placeBet = (game, userId, betAmount) => {
  game.players = game.players
    .filter(player => !player.out && !player.folded)
    .map(player => {
      if (player.id === userId) {
        // subtract money from player
        player.chips = player.chips - betAmount;
        // increase that player's current_stage_bet
        player.current_stage_bet = player.current_stage_bet + betAmount;
      }
      return player
    });
  // add money to pot
  game.pot = game.pot + betAmount;
  
  // change the bet leader if necessary
  // and change the amount to stay (the total amount, per person, bet this round)
  if (betAmount > game.cost_to_call) {
    game.bet_leader = userId;
    game.amount_to_stay = (betAmount - game.cost_to_call) + game.amount_to_stay
  }

  // set the turn options
  game.turn_options = 'after-bets';

  return game
}

module.exports = { placeBet, endHand };