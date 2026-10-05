const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

/** Money is stored as integer minor units, like the app. */
export const money = (minor: number) => gbp.format(minor / 100);
