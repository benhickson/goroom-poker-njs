const PokerEvaluator = require('latest-poker-evaluator');
const cards = require('./cards');
const { START_CHIPS } = require('./constants');

// this file is the pure poker logic

const getPayoutAmountsForWinners = (game) => {
  const amountToPayEach = parseFloat((game.pot / game.hand_winners.length).toFixed(2));
  return game.hand_winners.map(winner => ({
    user_id: winner.id,
    payout_amount: amountToPayEach,
  }));
}

// functions to set the maximum bet for the hand the amount of the lowest player's chip stack
// this serves as the "all-in" limit as well as the individual player limit
// TODO: when refactoring for enhanced "all-in" (side pots etc) this function can be removed, 
//       and simply compare against the player's chips at bet time.
const getMaxBetForNextPlayer = game => {
  return game.max_bet_for_hand - game.players.find(player => player.id === game.next_player).current_hand_bet;
}
const getSmallestChipStackAmount = game => {
  return game.players
    .filter(player => !player.out)
    .reduce((smallestChipStackAmount, player) => {
      return Math.min(smallestChipStackAmount, player.chips);
    }, game.players[0].chips);
}

const endHand = game => {
  
  // evaluate the cards set the winner(s) of the hand
  if (game.board_cards.length < 5) {
    // can't evaluate hands because not enough cards in play
    const winningPlayer = game.players.filter(player => !player.folded && !player.out)[0];
    game.hand_winners = [{
      id: winningPlayer.id,
      display_name: winningPlayer.display_name,
      score: 100, // arbitrary
      hand_name: '(all other players folded)',    
    }];
  } else {
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
        hand_name: evaluation.handName,
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
  }

  // show everyone's cards
  // TODO: this will have to change when show/muck cards options are enabled.
  game.players = game.players.map(player => {
    player.show_cards = true;
    return player;
  });

  // payouts
  payouts = getPayoutAmountsForWinners(game);
  console.log('payouts:', payouts);
  game.pot = 0;
  // perform the actual payouts
  payouts.forEach(payout => {
    game.players.forEach(player => {
      if (player.id === payout.user_id) {
        player.chips += payout.payout_amount; // this adds the payout to the user's chipcount
      }
      // reset all player's current_hand_bet to zero
      player.current_hand_bet = 0;
    });
  });

  // if any user's chipcounts have gone down to zero, mark them "out"
  game.players.forEach(player => {
    if (player.chips <= 0) {
      player.out = true;
      console.log(player.display_name, 'is out.');
    }
  });

  // if there is only one player left, declare them the winner
  const playersLeft = game.players.filter(player => !player.out);
  if (playersLeft.length === 1) {
    game.game_winner = {
      id: playersLeft[0].id,
      display_name: playersLeft[0].display_name,
    };
  }

  // limit the blinds to the "all-in" limits, currently these max bets
  // TODO: this will have to change with the introduction of side pots
  const smallStack = getSmallestChipStackAmount(game);
  game.small_blind = Math.min(START_CHIPS.small_blind, smallStack);
  game.big_blind = Math.min(START_CHIPS.big_blind, smallStack);

  // TODO: only using this to hide the action buttons... 
  //       there is possibly a better, more semantic way to do this.
  game.next_player = null;

  return game;
}

const placeBet = (game, userId, betAmount) => {
  // round it off to 2 decimals
  betAmount = parseFloat(betAmount.toFixed(2));

  // get a pointer/reference to the player to modify
  const bettingPlayer = game.players.find(player => player.id === userId);
  // subtract money from player
  bettingPlayer.chips -= betAmount;
  // increase player's current_stage_bet and current_hand_bet
  bettingPlayer.current_stage_bet += betAmount;
  bettingPlayer.current_hand_bet += betAmount;

  // add money to pot
  game.pot += betAmount;
  
  // change the bet leader if necessary
  // and change the amount to stay (the total amount, per person, bet this round)
  if (betAmount > game.cost_to_call) {
    game.bet_leader = userId;
    game.amount_to_stay += (betAmount - game.cost_to_call);
  }

  // set the turn options
  game.turn_options = 'after-bets';

  return game
}

module.exports = { 
  placeBet,
  endHand,
  getMaxBetForNextPlayer,
  getSmallestChipStackAmount,   
};