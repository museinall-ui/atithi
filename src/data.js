export const ROOM_TYPES = [
  { id: 'dlx',  name: 'Deluxe Tent',          tag: 'tagSaffron', units: 8, base: 4500 },
  { id: 'lux',  name: 'Luxury Tent (AC)',     tag: 'tagOlive',   units: 6, base: 7200 },
  { id: 'btub', name: 'Bathtub Tent',         tag: 'tagSky',     units: 4, base: 9500 },
  { id: 'pool', name: 'Private Pool Cottage', tag: 'tagPlum',    units: 3, base: 14500 },
];

export const DAYS = (() => {
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

export const BOOKINGS_SEED = [
  { id: 'BK-2841', roomTypeId: 'dlx',  unitIdx: 0, startIdx: 1, nights: 3, guest: 'Aanya Sharma',     status: 'confirmed', channel: 'direct',  total: 13500, paid: 13500, guests: '2A',     phone: '+91 98100 ··· 21' },
  { id: 'BK-2842', roomTypeId: 'dlx',  unitIdx: 1, startIdx: 0, nights: 2, guest: 'Rohan Mehta',      status: 'checkedin', channel: 'mmt',     total: 9000,  paid: 9000,  guests: '2A 1C',  phone: '+91 99003 ··· 88' },
  { id: 'BK-2843', roomTypeId: 'dlx',  unitIdx: 2, startIdx: 4, nights: 2, guest: 'Karthik Iyer',     status: 'confirmed', channel: 'goibibo', total: 9000,  paid: 4500,  guests: '2A',     phone: '+91 88000 ··· 12' },
  { id: 'BK-2844', roomTypeId: 'dlx',  unitIdx: 4, startIdx: 7, nights: 4, guest: 'Priya Nair',       status: 'tentative', channel: 'direct',  total: 18000, paid: 0,     guests: '2A',     phone: '+91 90220 ··· 33', releaseAt: '18:00' },
  { id: 'BK-2845', roomTypeId: 'lux',  unitIdx: 0, startIdx: 1, nights: 5, guest: 'James Whitman',    status: 'confirmed', channel: 'booking', total: 36000, paid: 18000, guests: '2A',     phone: '+44 7700 ··· 19',  formC: true },
  { id: 'BK-2846', roomTypeId: 'lux',  unitIdx: 1, startIdx: 3, nights: 2, guest: 'Vikram Sethi',     status: 'confirmed', channel: 'direct',  total: 14400, paid: 14400, guests: '2A 1C',  phone: '+91 98300 ··· 45' },
  { id: 'BK-2847', roomTypeId: 'lux',  unitIdx: 3, startIdx: 5, nights: 3, guest: 'Ananya & Vihaan',  status: 'confirmed', channel: 'direct',  total: 21600, paid: 21600, guests: '2A',     phone: '+91 91100 ··· 02' },
  { id: 'BK-2848', roomTypeId: 'btub', unitIdx: 0, startIdx: 2, nights: 4, guest: 'Sonia Banerjee',   status: 'confirmed', channel: 'mmt',     total: 38000, paid: 19000, guests: '2A',     phone: '+91 90909 ··· 17' },
  { id: 'BK-2849', roomTypeId: 'btub', unitIdx: 2, startIdx: 6, nights: 3, guest: "Maeve O'Connor",   status: 'confirmed', channel: 'booking', total: 28500, paid: 28500, guests: '2A',     phone: '+353 87 ··· 41', formC: true },
  { id: 'BK-2850', roomTypeId: 'pool', unitIdx: 0, startIdx: 1, nights: 4, guest: 'Aditya Birla',     status: 'confirmed', channel: 'direct',  total: 58000, paid: 58000, guests: '2A',     phone: '+91 90099 ··· 50', vip: true },
  { id: 'BK-2851', roomTypeId: 'pool', unitIdx: 1, startIdx: 5, nights: 2, guest: 'Tanvi Kapoor',     status: 'tentative', channel: 'direct',  total: 29000, paid: 0,     guests: '2A',     phone: '+91 90101 ··· 99', releaseAt: '20:00' },
  { id: 'BK-2852', roomTypeId: 'dlx',  unitIdx: 5, startIdx: 9, nights: 3, guest: 'Rajiv Malhotra',   status: 'confirmed', channel: 'direct',  total: 13500, paid: 6750,  guests: '2A',     phone: '+91 99999 ··· 33' },
  { id: 'BK-2853', roomTypeId: 'lux',  unitIdx: 4, startIdx: 10, nights: 2, guest: 'Hiroshi Tanaka',  status: 'confirmed', channel: 'booking', total: 14400, paid: 14400, guests: '2A',     phone: '+81 90 ··· 28', formC: true },
];

export const STATUS = {
  confirmed:  { label: 'Confirmed',   color: 'oklch(58% 0.13 155)', bg: 'oklch(94% 0.05 155)' },
  checkedin:  { label: 'Checked-in',  color: 'oklch(48% 0.14 265)', bg: 'oklch(94% 0.04 265)' },
  checkout:   { label: 'Checked-out', color: 'oklch(55% 0.04 60)',  bg: 'oklch(95% 0.012 60)' },
  tentative:  { label: 'On hold',     color: 'oklch(58% 0.14 75)',  bg: 'oklch(95% 0.05 75)' },
  cancelled:  { label: 'Cancelled',   color: 'oklch(60% 0.04 60)',  bg: 'oklch(94% 0.01 60)' },
};

export const CHANNELS = {
  direct:  { label: 'Direct',      color: 'oklch(60% 0.16 38)', short: 'D' },
  mmt:     { label: 'MakeMyTrip',  color: '#EB2026',  short: 'M' },
  goibibo: { label: 'Goibibo',     color: '#F0728F',  short: 'G' },
  booking: { label: 'Booking.com', color: '#003580',  short: 'B' },
  airbnb:  { label: 'Airbnb',      color: '#FF5A5F',  short: 'A' },
};

export const COUNTRIES = [
  { code: 'IN', name: 'India',         flag: '🇮🇳', dial: '+91' },
  { code: 'US', name: 'United States', flag: '🇺🇸', dial: '+1'  },
  { code: 'GB', name: 'United Kingdom',flag: '🇬🇧', dial: '+44' },
  { code: 'AU', name: 'Australia',     flag: '🇦🇺', dial: '+61' },
  { code: 'CA', name: 'Canada',        flag: '🇨🇦', dial: '+1'  },
  { code: 'DE', name: 'Germany',       flag: '🇩🇪', dial: '+49' },
  { code: 'FR', name: 'France',        flag: '🇫🇷', dial: '+33' },
  { code: 'IT', name: 'Italy',         flag: '🇮🇹', dial: '+39' },
  { code: 'ES', name: 'Spain',         flag: '🇪🇸', dial: '+34' },
  { code: 'NL', name: 'Netherlands',   flag: '🇳🇱', dial: '+31' },
  { code: 'IE', name: 'Ireland',       flag: '🇮🇪', dial: '+353'},
  { code: 'CH', name: 'Switzerland',   flag: '🇨🇭', dial: '+41' },
  { code: 'SE', name: 'Sweden',        flag: '🇸🇪', dial: '+46' },
  { code: 'NO', name: 'Norway',        flag: '🇳🇴', dial: '+47' },
  { code: 'JP', name: 'Japan',         flag: '🇯🇵', dial: '+81' },
  { code: 'KR', name: 'South Korea',   flag: '🇰🇷', dial: '+82' },
  { code: 'SG', name: 'Singapore',     flag: '🇸🇬', dial: '+65' },
  { code: 'AE', name: 'UAE',           flag: '🇦🇪', dial: '+971'},
  { code: 'IL', name: 'Israel',        flag: '🇮🇱', dial: '+972'},
  { code: 'RU', name: 'Russia',        flag: '🇷🇺', dial: '+7'  },
  { code: 'CN', name: 'China',         flag: '🇨🇳', dial: '+86' },
  { code: 'TH', name: 'Thailand',      flag: '🇹🇭', dial: '+66' },
  { code: 'NZ', name: 'New Zealand',   flag: '🇳🇿', dial: '+64' },
  { code: 'BR', name: 'Brazil',        flag: '🇧🇷', dial: '+55' },
  { code: 'ZA', name: 'South Africa',  flag: '🇿🇦', dial: '+27' },
  { code: 'NP', name: 'Nepal',         flag: '🇳🇵', dial: '+977'},
  { code: 'BT', name: 'Bhutan',        flag: '🇧🇹', dial: '+975'},
  { code: 'LK', name: 'Sri Lanka',     flag: '🇱🇰', dial: '+94' },
];

// Master list of amenities, grouped for browsability. Used by both the
// property-wide amenity picker and each room category's amenity picker.
export const AMENITIES = [
  // Comfort & Connectivity
  { id: 'wifi',         label: 'Free WiFi',          group: 'Comfort & Connectivity' },
  { id: 'ac',           label: 'Air conditioning',   group: 'Comfort & Connectivity' },
  { id: 'heater',       label: 'Room heater',        group: 'Comfort & Connectivity' },
  { id: 'fan',          label: 'Ceiling fan',        group: 'Comfort & Connectivity' },
  { id: 'tv',           label: 'TV',                 group: 'Comfort & Connectivity' },
  { id: 'ethernet',     label: 'Wired internet',     group: 'Comfort & Connectivity' },

  // In-room
  { id: 'minibar',      label: 'Mini bar / fridge',  group: 'In-room' },
  { id: 'kettle',       label: 'Tea / coffee maker', group: 'In-room' },
  { id: 'safe',         label: 'In-room safe',       group: 'In-room' },
  { id: 'workdesk',     label: 'Work desk',          group: 'In-room' },
  { id: 'iron',         label: 'Iron',               group: 'In-room' },
  { id: 'hairdryer',    label: 'Hair dryer',         group: 'In-room' },
  { id: 'balcony',      label: 'Balcony / patio',    group: 'In-room' },
  { id: 'bathtub',      label: 'Bathtub',            group: 'In-room' },
  { id: 'hotwater',     label: '24h hot water',      group: 'In-room' },
  { id: 'toiletries',   label: 'Toiletries',         group: 'In-room' },

  // Outdoor & View
  { id: 'desertview',   label: 'Desert view',        group: 'Outdoor & View' },
  { id: 'poolview',     label: 'Pool view',          group: 'Outdoor & View' },
  { id: 'gardenview',   label: 'Garden view',        group: 'Outdoor & View' },
  { id: 'mountainview', label: 'Mountain view',      group: 'Outdoor & View' },
  { id: 'privatepool',  label: 'Private pool',       group: 'Outdoor & View' },
  { id: 'bonfire',      label: 'Bonfire area',       group: 'Outdoor & View' },
  { id: 'bbq',          label: 'BBQ',                group: 'Outdoor & View' },
  { id: 'garden',       label: 'Garden',             group: 'Outdoor & View' },
  { id: 'terrace',      label: 'Terrace',            group: 'Outdoor & View' },

  // Property facilities
  { id: 'pool',         label: 'Swimming pool',      group: 'Property facilities' },
  { id: 'gym',          label: 'Gym',                group: 'Property facilities' },
  { id: 'spa',          label: 'Spa / wellness',     group: 'Property facilities' },
  { id: 'restaurant',   label: 'Restaurant',         group: 'Property facilities' },
  { id: 'bar',          label: 'Bar / lounge',       group: 'Property facilities' },
  { id: 'roomservice',  label: 'Room service',       group: 'Property facilities' },
  { id: 'breakfast',    label: 'Breakfast included', group: 'Property facilities' },
  { id: 'kitchenette',  label: 'Kitchenette',        group: 'Property facilities' },

  // Services
  { id: 'parking',      label: 'Free parking',       group: 'Services' },
  { id: 'valet',        label: 'Valet parking',      group: 'Services' },
  { id: 'laundry',      label: 'Laundry',            group: 'Services' },
  { id: 'reception24',  label: '24h reception',      group: 'Services' },
  { id: 'airportshuttle', label: 'Airport pickup',   group: 'Services' },
  { id: 'safari',       label: 'Safari arrangement', group: 'Services' },

  // Policies
  { id: 'petfriendly',  label: 'Pet-friendly',       group: 'Policies' },
  { id: 'wheelchair',   label: 'Wheelchair access',  group: 'Policies' },
  { id: 'smoking',      label: 'Smoking allowed',    group: 'Policies' },
];

export const EXTRAS_DEFAULT = [
  { id: 'breakfast', label: 'Breakfast',       sub: 'Veg buffet',   price: 350,  icon: 'veg' },
  { id: 'safari',    label: 'Desert safari',   sub: 'Per person',   price: 1500, icon: 'sun' },
  { id: 'pickup',    label: 'Station pickup',  sub: 'One-way',      price: 800,  icon: 'arrow' },
  { id: 'bonfire',   label: 'Bonfire & music', sub: 'Per evening',  price: 2500, icon: 'star' },
  { id: 'cake',      label: 'Celebration cake',sub: '1kg',          price: 1200, icon: 'tag' },
];
