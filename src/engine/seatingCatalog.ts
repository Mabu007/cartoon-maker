import { seatingStyles } from './characterCatalog.ts';
import type { Prop } from './schema.ts';

export type SeatingKind = typeof seatingStyles[number];
export function isSeating(kind:Prop['kind']):kind is SeatingKind {
  return (seatingStyles as readonly string[]).includes(kind);
}
export type Seat = {
  size:[number,number]; seat:number; color:string; back:string; base:string; detail:string;
  arms?:string; upholstered?:boolean;
};
const crossBase='M0 -44V-12 M-28 -5L0 -12L28 -5M-24 -5v4M24 -5v4 M0 -10v9';
const straightBase='M-33 -45L-39 0M33 -45L39 0';
const loungeArms='M-40 -54Q-49 -67 -55 -50L-49 -21H-32L-29 -40Q-31 -52 -40 -54Z M40 -54Q49 -67 55 -50L49 -21H32L29 -40Q31 -52 40 -54Z';
export const seats = {
  'gaming-chair':{size:[112,148],seat:-47,color:'#6852a3',back:'M-35 -42L-46 -104L-36 -132L-20 -145H20L36 -132L46 -104L35 -42Z',base:crossBase,detail:'M-32 -122L-25 -102L-23 -59M32 -122L25 -102L23 -59M-16 -122H16V-107H-16Z',arms:loungeArms,upholstered:true},
  'executive-chair':{size:[114,142],seat:-55,color:'#7c4f56',back:'M-40 -50L-46 -119Q-44 -138 -24 -141H27Q47 -137 46 -119L40 -50Z',base:crossBase,detail:'M-36 -121L36 -64M36 -121L-36 -64M-34 -93H34',arms:loungeArms,upholstered:true},
  'mesh-chair':{size:[100,121],seat:-47,color:'#5c7280',back:'M-37 -51L-43 -97Q-40 -120 0 -120Q40 -120 43 -97L37 -51Z',base:crossBase,detail:'M-31 -103H31M-35 -96H35M-35 -88H35M-34 -80H34M-32 -72H32M-30 -64H30',arms:'M-46 -64H-27V-60H-39V-41H-46Z M46 -64H27V-60H39V-41H46Z'},
  'dining-chair':{size:[86,123],seat:-48,color:'#a46a46',back:'M-40 -49V-122H40V-49 M-37 -120H37V-108H-37Z',base:straightBase,detail:'M-26 -108V-49M-9 -108V-49M9 -108V-49M26 -108V-49'},
  armchair:{size:[128,121],seat:-42,color:'#bb795f',back:'M-49 -38V-98Q-58 -121 -37 -120L-28 -109Q0 -123 28 -109L37 -120Q58 -121 49 -98V-38Z',base:straightBase,detail:'M-27 -105Q0 -113 27 -105Q39 -71 26 -52H-26Q-39 -71 -27 -105Z',arms:loungeArms,upholstered:true},
  beanbag:{size:[119,91],seat:-22,color:'#b46084',back:'M-54 -3Q-65 -20 -49 -39Q-42 -49 -32 -68Q-22 -99 1 -88Q30 -84 36 -54Q70 -29 58 -9Q40 3 -54 -3Z',base:'',detail:'M-47 -18Q-18 -33 14 -24Q37 -25 52 -17',upholstered:true},
  'bar-stool':{size:[77,92],seat:-86,color:'#975c50',back:'M-37 -91Q0 -101 37 -91V-81Q0 -69 -37 -81Z',base:'M-25 -82L-31 0M25 -82L31 0M-28 -33Q0 -24 28 -33',detail:'M-23 -89Q0 -94 23 -89'},
  'camp-chair':{size:[110,116],seat:-45,color:'#6b8465',back:'M-44 -102Q0 -116 44 -102L31 -42H-31Z',base:'M-47 -2L37 -56M47 -2L-37 -56',detail:'M-34 -94Q0 -106 34 -94',arms:'M-51 -61L-21 -53L-25 -46L-53 -53Z M51 -61L21 -53L25 -46L53 -53Z'},
  throne:{size:[140,171],seat:-51,color:'#95609a',back:'M-52 -50V-159L-34 -146L-20 -167L0 -157L20 -167L34 -146L52 -159V-50Z',base:'M-44 -48L-49 0M44 -48L49 0',detail:'M-38 -58V-139L0 -150L38 -139V-58Z M-25 -124L25 -75M25 -124L-25 -75',arms:loungeArms,upholstered:true},
  'salon-chair':{size:[116,128],seat:-53,color:'#7e626b',back:'M-41 -49L-36 -102Q-32 -116 -14 -114V-127H14V-114Q32 -116 36 -102L41 -49Z',base:'M0 -47V-12 M-44 -8Q0 -24 44 -8Q0 7 -44 -8Z',detail:'M-28 -103Q0 -111 28 -103M-32 -73H32',arms:loungeArms,upholstered:true},
  wheelchair:{size:[130,131],seat:-53,color:'#547f94',back:'M-39 -54V-119H39V-54Z',base:'M-39 -117V-127H-51M39 -117V-127H51 M-36 -55V-26H36V-55',detail:'M-30 -104H30M-30 -97H30',arms:'M-54 -65H-24V-58H-45V-37H-54Z M54 -65H24V-58H45V-37H54Z'},
  'corner-sofa':{size:[233,114],seat:-38,color:'#b47261',back:'M-106 -30V-83Q-107 -105 -83 -107H79Q101 -105 101 -83L116 -35L55 -18H-103Z',base:'M-90 -23V-2M88 -30V-2',detail:'M-92 -92H89M-25 -98V-43M35 -98V-43',arms:'M-111 -57Q-121 -52 -116 -26L-90 -18L-77 -29L-89 -56Z M107 -57Q119 -51 116 -24L82 -12L73 -26L87 -55Z',upholstered:true}
} satisfies Record<SeatingKind,Seat>;
