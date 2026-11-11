// 24 advent rewards. `grants` are applied server-side (or by the demo engine).
// types: coins | skin | weapon | character | boost
export const ADVENT_REWARDS = [
  { day: 1, name: 'Pocket Change', rarity: 'common', grants: [{ type: 'coins', amount: 100 }] },
  { day: 2, name: 'Cocoa Rush', rarity: 'common', grants: [{ type: 'boost', id: 'xp_boost', amount: 1 }] },
  { day: 3, name: 'Candy Striper Elf', rarity: 'rare', grants: [{ type: 'skin', id: 'elf_candy' }] },
  { day: 4, name: 'Stocking Stash', rarity: 'common', grants: [{ type: 'coins', amount: 150 }] },
  { day: 5, name: 'Christmas Bells', rarity: 'rare', grants: [{ type: 'weapon', id: 'bells' }] },
  { day: 6, name: 'Gingerbread Hearts', rarity: 'common', grants: [{ type: 'boost', id: 'heart_boost', amount: 2 }] },
  { day: 7, name: 'Frost Coin Pouch', rarity: 'common', grants: [{ type: 'coins', amount: 200 }] },
  { day: 8, name: 'Tinsel Magnets', rarity: 'common', grants: [{ type: 'boost', id: 'magnet_boost', amount: 2 }] },
  { day: 9, name: 'Wrapped Wallet', rarity: 'common', grants: [{ type: 'coins', amount: 200 }] },
  { day: 10, name: 'Gingerbread Bombs', rarity: 'rare', grants: [{ type: 'weapon', id: 'bomb' }] },
  { day: 11, name: 'Top Hat Snowman', rarity: 'rare', grants: [{ type: 'skin', id: 'snowman_festive' }] },
  { day: 12, name: 'Half-Way Hoard', rarity: 'rare', grants: [{ type: 'coins', amount: 300 }] },
  { day: 13, name: 'Double Cocoa', rarity: 'common', grants: [{ type: 'boost', id: 'xp_boost', amount: 2 }] },
  { day: 14, name: 'Glow-Nose Reindeer', rarity: 'epic', grants: [{ type: 'skin', id: 'reindeer_glow' }] },
  { day: 15, name: 'Treasure Crackers', rarity: 'common', grants: [{ type: 'coins', amount: 250 }] },
  { day: 16, name: 'Snow Shields', rarity: 'common', grants: [{ type: 'boost', id: 'shield_boost', amount: 2 }] },
  { day: 17, name: 'Snowman Recruit', rarity: 'epic', grants: [{ type: 'character', id: 'snowman' }] },
  { day: 18, name: 'Sack of Coins', rarity: 'rare', grants: [{ type: 'coins', amount: 400 }] },
  { day: 19, name: 'Royal Knight', rarity: 'epic', grants: [{ type: 'skin', id: 'knight_royal' }] },
  { day: 20, name: 'Triple Cocoa', rarity: 'rare', grants: [{ type: 'boost', id: 'xp_boost', amount: 3 }] },
  { day: 21, name: 'Reindeer Recruit', rarity: 'epic', grants: [{ type: 'character', id: 'reindeer' }] },
  { day: 22, name: 'Golden Stocking', rarity: 'epic', grants: [{ type: 'coins', amount: 500 }] },
  { day: 23, name: 'Golden Santa', rarity: 'legendary', grants: [{ type: 'skin', id: 'santa_gold' }] },
  { day: 24, name: 'Christmas Eve Miracle', rarity: 'legendary', grants: [{ type: 'skin', id: 'santa_aurora' }, { type: 'coins', amount: 1000 }] }
];

export const ADVENT_BY_DAY = Object.fromEntries(ADVENT_REWARDS.map((r) => [r.day, r]));
