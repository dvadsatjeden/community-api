import type { VenueItem } from "../contracts";

const mockVenues: VenueItem[] = [
  {
    id: "brno-bitcoin-beer",
    name: "Bitcoin Beer Brno",
    lat: 49.1951,
    lng: 16.6068,
    address: "Jana Uhra 10, Brno",
    category: "Meetup",
    sourceUrl: "https://prevadzky.dvadsatjeden.org",
  },
];

export const listVenues = (): VenueItem[] => mockVenues;
