// data.jsx — mock data for Yatra Desert Camp, Jaisalmer

const ROOM_TYPES = [
  { id: 'dlx',  name: 'Deluxe Tent',          tag: 'tagSaffron', units: 8, base: 4500 },
  { id: 'lux',  name: 'Luxury Tent (AC)',     tag: 'tagOlive',   units: 6, base: 7200 },
  { id: 'btub', name: 'Bathtub Tent',         tag: 'tagSky',     units: 4, base: 9500 },
  { id: 'pool', name: 'Private Pool Cottage', tag: 'tagPlum',    units: 3, base: 14500 },
];

// 14 days starting May 4, 2026 (Mon)
const DAYS = (() => {
  const out = [];
  const start = new Date(2026, 4, 4);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      dow: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(d.getDay() + 6) % 7],
      dom: d.getDate(),
      month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()],
      isWknd: d.getDay() === 5 || d.getDay() === 6,
      idx: i,
    });
  }
  return out;
})();

// Bookings: { id, roomTypeId, unitIdx, startIdx, nights, guest, status, channel, total, paid }
const BOOKINGS_SEED = [
  { id: 'BK-2841', roomTypeId: 'dlx',  unitIdx: 0, startIdx: 1, nights: 3, guest: 'Aanya Sharma',     status: 'confirmed', channel: 'direct',  total: 13500, paid: 13500, guests: '2A',     phone: '+91 98100 ··· 21' },
  { id: 'BK-2842', roomTypeId: 'dlx',  unitIdx: 1, startIdx: 0, nights: 2, guest: 'Rohan Mehta',      status: 'checkedin', channel: 'mmt',     total: 9000,  paid: 9000,  guests: '2A 1C',  phone: '+91 99003 ··· 88' },
  { id: 'BK-2843', roomTypeId: 'dlx',  unitIdx: 2, startIdx: 4, nights: 2, guest: 'Karthik Iyer',     status: 'confirmed', channel: 'goibibo', total: 9000,  paid: 4500,  guests: '2A',     phone: '+91 88000 ··· 12' },
  { id: 'BK-2844', roomTypeId: 'dlx',  unitIdx: 4, startIdx: 7, nights: 4, guest: 'Priya Nair',       status: 'tentative', channel: 'direct',  total: 18000, paid: 0,     guests: '2A',     phone: '+91 90220 ··· 33', releaseAt: '18:00' },
  { id: 'BK-2845', roomTypeId: 'lux',  unitIdx: 0, startIdx: 1, nights: 5, guest: 'James Whitman',    status: 'confirmed', channel: 'booking', total: 36000, paid: 18000, guests: '2A',     phone: '+44 7700 ··· 19',  formC: true },
  { id: 'BK-2846', roomTypeId: 'lux',  unitIdx: 1, startIdx: 3, nights: 2, guest: 'Vikram Sethi',     status: 'confirmed', channel: 'direct',  total: 14400, paid: 14400, guests: '2A 1C',  phone: '+91 98300 ··· 45' },
  { id: 'BK-2847', roomTypeId: 'lux',  unitIdx: 3, startIdx: 5, nights: 3, guest: 'Ananya & Vihaan',  status: 'confirmed', channel: 'direct',  total: 21600, paid: 21600, guests: '2A',     phone: '+91 91100 ··· 02' },
  { id: 'BK-2848', roomTypeId: 'btub',unitIdx: 0, startIdx: 2, nights: 4, guest: 'Sonia Banerjee',   status: 'confirmed', channel: 'mmt',     total: 38000, paid: 19000, guests: '2A',     phone: '+91 90909 ··· 17' },
  { id: 'BK-2849', roomTypeId: 'btub',unitIdx: 2, startIdx: 6, nights: 3, guest: 'Maeve O\'Connor',  status: 'confirmed', channel: 'booking', total: 28500, paid: 28500, guests: '2A',     phone: '+353 87 ··· 41', formC: true },
  { id: 'BK-2850', roomTypeId: 'pool',unitIdx: 0, startIdx: 1, nights: 4, guest: 'Aditya Birla',     status: 'confirmed', channel: 'direct',  total: 58000, paid: 58000, guests: '2A',     phone: '+91 90099 ··· 50', vip: true },
  { id: 'BK-2851', roomTypeId: 'pool',unitIdx: 1, startIdx: 5, nights: 2, guest: 'Tanvi Kapoor',     status: 'tentative', channel: 'direct',  total: 29000, paid: 0,     guests: '2A',     phone: '+91 90101 ··· 99', releaseAt: '20:00' },
  { id: 'BK-2852', roomTypeId: 'dlx', unitIdx: 5, startIdx: 9, nights: 3, guest: 'Rajiv Malhotra',   status: 'confirmed', channel: 'direct',  total: 13500, paid: 6750,  guests: '2A',     phone: '+91 99999 ··· 33' },
  { id: 'BK-2853', roomTypeId: 'lux', unitIdx: 4, startIdx: 10,nights: 2, guest: 'Hiroshi Tanaka',   status: 'confirmed', channel: 'booking', total: 14400, paid: 14400, guests: '2A',     phone: '+81 90 ··· 28', formC: true },
];

const STATUS = {
  confirmed:  { label: 'Confirmed',  color: 'oklch(58% 0.13 155)', bg: 'oklch(94% 0.05 155)' },
  checkedin:  { label: 'Checked-in', color: 'oklch(48% 0.14 265)', bg: 'oklch(94% 0.04 265)' },
  tentative:  { label: 'On hold',    color: 'oklch(58% 0.14 75)',  bg: 'oklch(95% 0.05 75)' },
  cancelled:  { label: 'Cancelled',  color: 'oklch(60% 0.04 60)',  bg: 'oklch(94% 0.01 60)' },
};

const CHANNELS = {
  direct:  { label: 'Direct',          color: T.primary,  short: 'D' },
  mmt:     { label: 'MakeMyTrip',      color: '#EB2026',  short: 'M' },
  goibibo: { label: 'Goibibo',         color: '#F0728F',  short: 'G' },
  booking: { label: 'Booking.com',     color: '#003580',  short: 'B' },
  airbnb:  { label: 'Airbnb',          color: '#FF5A5F',  short: 'A' },
};

// Helper to get unit count per type
const unitsFor = (typeId) => ROOM_TYPES.find(r => r.id === typeId).units;

Object.assign(window, { ROOM_TYPES, DAYS, BOOKINGS_SEED, STATUS, CHANNELS, unitsFor });
