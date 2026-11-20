// "Lit up" rule for the Collection: an item looks bright if you own it OR could buy it right now.
// Anything you cannot afford (or can never buy, like advent-only items) stays dimmed.
export const affordable = (signedIn, coins, price) => !!signedIn && Number.isFinite(price) && coins >= price;
export const isLit = (owned, signedIn, coins, price) => !!owned || affordable(signedIn, coins, price);
