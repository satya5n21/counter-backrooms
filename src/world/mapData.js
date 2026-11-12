// Hand-crafted arena layout. One character = one 2.5m cell.
//  #  wall                 W  wall with a window (west edge, faces the sunset)
//  .  floor                P  pillar
//  T  potted plant         C  couch (backs onto the nearest wall)
//  L  floor lamp           h  pickup spot
//  S  bot spawn point      X  player start
//  A  office chair (decor; skipped if its model is missing)
//
// Layout: a long sunlit gallery runs down the west side, a pillared atrium
// sits in the middle, and quieter rooms and corridors wrap around the rest.
export const MAP_ROWS = [
  '##################################',
  'W.....#A........#...S...#.......T#',
  '#.T...#...L.....#.......#........#',
  'W.................h.....#..S.....#',
  '#.....#.........#.......#A.......#',
  'W.....#.........#.......##.#######',
  '#.C...####.#######.######........#',
  'W.......................#..C.....#',
  '#.....#.................#........#',
  'W.....#..P...P...P...P..#...L....#',
  '#..L..#.....................h....#',
  'W.....#.................#........#',
  '#.....#........X........#####.####',
  'W.....#.................#........#',
  '#..T..#..P...P...P...P..........S#',
  'W.......................#........#',
  '#.....#.........h.......#..T.....#',
  'W.C...####.#####.#####.###.#######',
  '#.....#.......A#.....A#..........#',
  'W.....#..L.....#..C...#....L.....#',
  '#.....#........#......#.........A#',
  'W..h...........#.................#',
  '#.T...#..C.....#.........#.......#',
  'W.....#.....S..#..T...h..#....S..#',
  '#.....#........#.........#.......#',
  '##################################',
];
