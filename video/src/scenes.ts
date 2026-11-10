import type { SceneSpec } from './components/ShotScene';
import { C } from './theme';

/**
 * The walkthrough, scene by scene. Follows docs/onboarding-walkthrough-script.md.
 * Coordinates are page CSS px from src/shots.json (1440×900 viewport).
 * Frames are at 30 fps, local to each scene.
 */
const PORTAL = 'guidonbrewing.com/wholesale';

export const SCENES: SceneSpec[] = [
  {
    id: 'email',
    step: 1,
    title: 'Your welcome email',
    duration: 270,
    url: 'Inbox — Guidon Brewing Co.',
    states: [{ at: 0, shot: 'email' }],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 45, x: 600, y: 330, z: 1.55 },
      { at: 140, x: 610, y: 410, z: 1.85 },
      { at: 270, x: 610, y: 410, z: 1.9 },
    ],
    highlights: [
      { from: 60, to: 135, box: { x: 469, y: 392, w: 228, h: 43 } },
      { from: 145, to: 215, box: { x: 625, y: 447, w: 106, h: 19 } },
    ],
    cursor: [
      { at: 190, x: 860, y: 560 },
      { at: 235, x: 583, y: 413, click: true },
      { at: 270, x: 583, y: 413 },
    ],
    captions: [
      { from: 0, text: 'Your account is approved. Watch for this welcome email from Guidon.' },
      { from: 140, text: 'Note your temporary password, then click **Open wholesale portal**.' },
    ],
  },
  {
    id: 'signin',
    step: 2,
    title: 'Sign in',
    duration: 300,
    url: PORTAL,
    states: [
      { at: 0, shot: 'landing' },
      { at: 48, shot: 'signin-empty', fade: 8 },
      { at: 105, shot: 'signin-email', reveal: [{ box: { x: 553, y: 462, w: 334, h: 45 }, at: 108, len: 28 }] },
      { at: 165, shot: 'signin-filled', reveal: [{ box: { x: 553, y: 549, w: 334, h: 45 }, at: 168, len: 18 }] },
    ],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 50, x: 720, y: 548, z: 1.55 },
      { at: 300, x: 720, y: 552, z: 1.6 },
    ],
    cursor: [
      { at: 10, x: 1020, y: 720 },
      { at: 42, x: 720, y: 535, click: true },
      { at: 100, x: 640, y: 484, click: true },
      { at: 160, x: 640, y: 571, click: true },
      { at: 240, x: 720, y: 634, click: true },
      { at: 300, x: 720, y: 634 },
    ],
    captions: [
      { from: 0, text: 'Click **Sign In**, then enter the email the brewery has on file…' },
      { from: 155, text: '…and the temporary password from your welcome email.' },
    ],
  },
  {
    id: 'password',
    step: 3,
    title: 'Set your password',
    duration: 270,
    url: PORTAL,
    states: [
      { at: 0, shot: 'setpw-empty' },
      {
        at: 70,
        shot: 'setpw-filled',
        reveal: [
          { box: { x: 553, y: 445, w: 334, h: 45 }, at: 72, len: 20 },
          { box: { x: 553, y: 532, w: 334, h: 45 }, at: 128, len: 20 },
        ],
      },
    ],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 40, x: 720, y: 520, z: 1.6 },
      { at: 270, x: 720, y: 525, z: 1.65 },
    ],
    cursor: [
      { at: 30, x: 980, y: 700 },
      { at: 66, x: 640, y: 467, click: true },
      { at: 122, x: 640, y: 554, click: true },
      { at: 205, x: 720, y: 617, click: true },
      { at: 270, x: 720, y: 617 },
    ],
    captions: [
      { from: 0, text: 'The first time you sign in, choose your own password.' },
      { from: 150, text: 'Type it twice and click **Set password**. You won’t need the temporary one again.' },
    ],
  },
  {
    id: 'overview',
    step: 4,
    title: 'Your account home',
    duration: 330,
    url: PORTAL,
    states: [{ at: 0, shot: 'overview' }],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 45, x: 720, y: 250, z: 1.3 },
      { at: 125, x: 720, y: 410, z: 1.3 },
      { at: 205, x: 720, y: 680, z: 1.3 },
      { at: 275, x: 720, y: 450, z: 1 },
    ],
    highlights: [
      { from: 45, to: 120, box: { x: 112, y: 176, w: 1216, h: 112 } },
      { from: 125, to: 200, box: { x: 112, y: 315, w: 1216, h: 175 } },
      { from: 205, to: 270, box: { x: 112, y: 598, w: 1216, h: 200 } },
    ],
    cursor: [
      { at: 270, x: 700, y: 420 },
      { at: 305, x: 302, y: 119, click: true },
      { at: 330, x: 302, y: 119 },
    ],
    captions: [
      { from: 0, text: 'This is your account home.' },
      { from: 45, text: 'See your orders at a glance…' },
      { from: 125, text: '…the kegs you have out, by size…' },
      { from: 205, text: '…and your most recent orders.' },
    ],
  },
  {
    id: 'browse',
    step: 5,
    title: 'Browse & order',
    duration: 420,
    url: PORTAL,
    states: [
      { at: 0, shot: 'browse-0' },
      {
        at: 150,
        shot: 'browse-1',
        reveal: [
          { box: { x: 535, y: 1155, w: 370, h: 36 }, at: 152, len: 4 },
          { box: { x: 535, y: 1200, w: 128, h: 44 }, at: 200, len: 4 },
        ],
      },
      { at: 248, shot: 'browse-2', fade: 6 },
    ],
    camera: [
      { at: 0, x: 720, y: 450, z: 1, scroll: 0 },
      { at: 50, x: 720, y: 450, z: 1, scroll: 0 },
      { at: 105, x: 720, y: 1050, z: 1, scroll: 600 },
      { at: 135, x: 720, y: 1080, z: 1.6, scroll: 600 },
      { at: 260, x: 720, y: 1080, z: 1.6, scroll: 600 },
      { at: 310, x: 720, y: 450, z: 1, scroll: 0 },
      { at: 345, x: 1060, y: 260, z: 1.45, scroll: 0 },
    ],
    cursor: [
      { at: 120, x: 1000, y: 1330 },
      { at: 150, x: 720, y: 1173, click: true },
      { at: 198, x: 640, y: 1222, click: true },
      { at: 246, x: 781, y: 1222, click: true },
      { at: 300, x: 900, y: 500 },
      { at: 380, x: 1207, y: 212, click: true },
      { at: 420, x: 1207, y: 212 },
    ],
    highlights: [{ from: 135, to: 245, box: { x: 524, y: 839, w: 392, h: 426 } }],
    captions: [
      { from: 0, text: 'To order, open **Browse & Order**.' },
      { from: 120, text: 'Pick a beer, then a keg size and quantity. Sizes that are out are greyed out.' },
      { from: 240, text: '…and add it to your cart.' },
      { from: 320, text: 'When you’re ready, click **Review Cart**.' },
    ],
  },
  {
    id: 'checkout',
    step: 6,
    title: 'Checkout & keg returns',
    duration: 390,
    url: PORTAL,
    states: [
      { at: 0, shot: 'checkout-0' },
      {
        at: 110,
        shot: 'checkout-1',
        reveal: [
          { box: { x: 871, y: 471, w: 80, h: 45 }, at: 118, len: 6 },
          { box: { x: 871, y: 525, w: 80, h: 45 }, at: 158, len: 6 },
        ],
      },
      { at: 225, shot: 'checkout-2', fade: 10 },
    ],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 35, x: 720, y: 330, z: 1.45 },
      { at: 105, x: 720, y: 470, z: 1.55 },
      { at: 225, x: 720, y: 470, z: 1.55 },
      { at: 250, x: 720, y: 690, z: 1.5 },
      { at: 390, x: 720, y: 700, z: 1.5 },
    ],
    highlights: [
      { from: 35, to: 100, box: { x: 489, y: 262, w: 462, h: 88 } },
      { from: 105, to: 215, box: { x: 489, y: 360, w: 462, h: 215 } },
    ],
    cursor: [
      { at: 85, x: 1060, y: 640 },
      { at: 115, x: 911, y: 493, click: true },
      { at: 155, x: 911, y: 547, click: true },
      { at: 265, x: 497, y: 774, click: true },
      { at: 340, x: 838, y: 816, click: true },
      { at: 390, x: 838, y: 816 },
    ],
    captions: [
      { from: 0, text: 'Review your order. We deliver on Thursdays and Fridays.' },
      { from: 105, text: 'Enter how many empty kegs you’re sending back with this delivery.' },
      { from: 235, text: 'Tick the box to confirm your keg returns, then click **Place Order**.' },
    ],
  },
  {
    id: 'placed',
    step: 7,
    title: 'Order placed',
    duration: 300,
    url: PORTAL,
    states: [{ at: 0, shot: 'orders' }],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 40, x: 720, y: 360, z: 1.45 },
      { at: 300, x: 720, y: 370, z: 1.5 },
    ],
    highlights: [{ from: 40, to: 290, box: { x: 112, y: 380, w: 1216, h: 62 } }],
    captions: [
      { from: 0, text: 'Done! Your order is in, and a confirmation email is on its way.' },
      { from: 140, text: 'The brewery schedules delivery for the next Thursday or Friday.' },
    ],
    stamps: [{ at: 150, lines: ['Delivered', 'Thursdays & Fridays'], x: 1400, y: 650, rotate: -7, color: C.olive }],
  },
  {
    id: 'history',
    step: 8,
    title: 'Orders & invoices',
    duration: 300,
    url: PORTAL,
    states: [
      { at: 0, shot: 'orders' },
      { at: 118, shot: 'invoices', fade: 8 },
    ],
    camera: [
      { at: 0, x: 720, y: 330, z: 1.2 },
      { at: 70, x: 720, y: 330, z: 1.2 },
      { at: 100, x: 720, y: 400, z: 1 },
      { at: 145, x: 720, y: 300, z: 1.4 },
    ],
    highlights: [{ from: 150, to: 290, box: { x: 112, y: 212, w: 1216, h: 156 } }],
    cursor: [
      { at: 60, x: 900, y: 450 },
      { at: 112, x: 579, y: 119, click: true },
      { at: 140, x: 700, y: 520 },
    ],
    cursorHideAt: 150,
    captions: [
      { from: 0, text: 'Every order you’ve placed lives in **Order History**…' },
      { from: 118, text: '…and every invoice under **Invoices**. Payment is due on delivery.' },
    ],
    stamps: [{ at: 190, lines: ['Payment due', 'on delivery'], x: 1480, y: 735, rotate: 6, color: C.ruby }],
  },
  {
    id: 'account',
    step: 9,
    title: 'Your account',
    duration: 255,
    url: PORTAL,
    states: [{ at: 0, shot: 'account' }],
    camera: [
      { at: 0, x: 720, y: 450, z: 1, scroll: 0 },
      { at: 30, x: 720, y: 450, z: 1, scroll: 0 },
      { at: 70, x: 470, y: 690, z: 1.25, scroll: 300 },
      { at: 140, x: 470, y: 690, z: 1.25, scroll: 300 },
      { at: 175, x: 470, y: 1160, z: 1.3, scroll: 553 },
    ],
    highlights: [
      { from: 70, to: 140, box: { x: 112, y: 387, w: 505, h: 612 } },
      { from: 175, to: 250, box: { x: 112, y: 1064, w: 505, h: 266 } },
    ],
    cursor: [
      { at: 0, x: 900, y: 400 },
      { at: 25, x: 682, y: 119, click: true },
      { at: 45, x: 760, y: 300 },
    ],
    cursorHideAt: 55,
    captions: [
      { from: 0, text: 'Under **Account**, update your contact details and address…' },
      { from: 150, text: '…or change your password any time.' },
    ],
  },
  {
    id: 'help',
    step: 10,
    title: 'Help is a click away',
    duration: 285,
    url: PORTAL,
    states: [{ at: 0, shot: 'help' }],
    camera: [
      { at: 0, x: 720, y: 450, z: 1 },
      { at: 35, x: 720, y: 450, z: 1 },
      { at: 75, x: 700, y: 360, z: 1.3 },
      { at: 150, x: 600, y: 520, z: 1.2 },
    ],
    highlights: [
      { from: 75, to: 145, box: { x: 403, y: 180, w: 767, h: 342 } },
      { from: 150, to: 220, box: { x: 112, y: 175, w: 259, h: 700 } },
    ],
    cursor: [
      { at: 0, x: 1000, y: 420 },
      { at: 28, x: 773, y: 119, click: true },
      { at: 50, x: 900, y: 300 },
    ],
    cursorHideAt: 60,
    captions: [
      { from: 0, text: 'Questions? The **Help** tab walks through everything…' },
      { from: 190, text: 'Or just reply to any Guidon email. It comes straight to the brewery.' },
    ],
  },
];
