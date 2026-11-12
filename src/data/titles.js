// Titles: cosmetic badges shown next to a player's name. Most unlock automatically from lifetime stats
// (the server re-checks after every run, claim and purchase). `manual` titles are only granted by the owner.
export const TITLES = [
  { id: 'fresh_snowflake', name: 'Fresh Snowflake', rarity: 'common', desc: 'Finish your first run.', stat: 'games_played', target: 1 },
  { id: 'regular_reveller', name: 'Regular Reveller', rarity: 'common', desc: 'Play 10 runs.', stat: 'games_played', target: 10 },
  { id: 'seasoned_survivor', name: 'Seasoned Survivor', rarity: 'rare', desc: 'Play 50 runs.', stat: 'games_played', target: 50 },
  { id: 'snowball_menace', name: 'Snowball Menace', rarity: 'common', desc: 'Defeat 500 enemies.', stat: 'total_kills', target: 500 },
  { id: 'winter_warlord', name: 'Winter Warlord', rarity: 'rare', desc: 'Defeat 5,000 enemies.', stat: 'total_kills', target: 5000 },
  { id: 'frost_reaper', name: 'Frost Reaper', rarity: 'legendary', desc: 'Defeat 25,000 enemies.', stat: 'total_kills', target: 25000 },
  { id: 'boss_hunter', name: 'Boss Hunter', rarity: 'common', desc: 'Reach wave 5.', stat: 'best_wave', target: 5 },
  { id: 'midwinter_mauler', name: 'Midwinter Mauler', rarity: 'rare', desc: 'Reach wave 10.', stat: 'best_wave', target: 10 },
  { id: 'eternal_winter', name: 'Eternal Winter', rarity: 'epic', desc: 'Reach wave 20.', stat: 'best_wave', target: 20 },
  { id: 'giant_slayer', name: 'Giant Slayer', rarity: 'common', desc: 'Defeat a boss.', stat: 'bosses_defeated', target: 1 },
  { id: 'boss_breaker', name: 'Boss Breaker', rarity: 'rare', desc: 'Defeat 10 bosses.', stat: 'bosses_defeated', target: 10 },
  { id: 'krampus_nightmare', name: "Krampus's Nightmare", rarity: 'epic', desc: 'Defeat 25 bosses.', stat: 'bosses_defeated', target: 25 },
  { id: 'tinsel_titan', name: 'Tinsel Titan', rarity: 'rare', desc: 'Score 10,000 in a single run.', stat: 'best_score', target: 10000 },
  { id: 'north_pole_legend', name: 'North Pole Legend', rarity: 'legendary', desc: 'Score 50,000 in a single run.', stat: 'best_score', target: 50000 },
  { id: 'present_hunter', name: 'Present Hunter', rarity: 'common', desc: 'Open 25 mystery presents.', stat: 'presents_opened', target: 25 },
  { id: 'gift_goblin', name: 'Gift Goblin', rarity: 'rare', desc: 'Open 100 mystery presents.', stat: 'presents_opened', target: 100 },
  { id: 'long_night', name: 'Long Night Survivor', rarity: 'rare', desc: 'Survive 1 hour in total.', stat: 'total_seconds', target: 3600 },
  { id: 'advent_devotee', name: 'Advent Devotee', rarity: 'rare', desc: 'Claim 12 advent doors.', stat: 'advent_claims', target: 12 },
  { id: 'calendar_complete', name: 'Calendar Completionist', rarity: 'epic', desc: 'Claim all 24 doors of an advent calendar.', stat: 'advent_claims', target: 24 },
  { id: 'full_sleigh', name: 'Full Sleigh Team', rarity: 'epic', desc: 'Unlock all five heroes.', stat: 'heroes_owned', target: 5 },
  { id: 'fashionista', name: 'Fashionista', rarity: 'rare', desc: 'Own 10 skins.', stat: 'skins_owned', target: 10 },
  { id: 'founder', name: 'Founder', rarity: 'epic', desc: 'Played in the earliest days. Granted by hand.', manual: true },
  { id: 'owner', name: 'Owner', rarity: 'owner', desc: 'Built this place. Granted by hand.', manual: true }
];
export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

/** stats: games_played, total_kills, best_wave, bosses_defeated, best_score, presents_opened, total_seconds, advent_claims, heroes_owned, skins_owned */
export const evaluateTitles = (stats) => TITLES.filter((t) => !t.manual && Number(stats[t.stat] || 0) >= t.target).map((t) => t.id);
export const titleProgress = (t, stats) => [Math.min(Number(stats[t.stat] || 0), t.target), t.target];
