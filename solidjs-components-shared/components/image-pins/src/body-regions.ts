// The built-in body figure's regions (`figure: "body"`), per view, in reading order (head to toe,
// the person's right before their left), with the point a pin for each region goes to: x and y are
// fractions (0 to 1) of the view's width and height, the coordinates a pin stores. Left and right
// are the PERSON's.
//
// Plain data with no imports, so scripts can import this file directly (Node strips the types), for
// example to seed pins by region name. Made from the geometry in body.ts: don't edit by hand. The
// unit test test/body.test.ts checks it; `UPDATE_BODY_REGIONS=1 pnpm test` rewrites it.

export interface BodyRegionCentre {
  name: string;
  group: string;
  x: number;
  y: number;
}

export const BODY_REGIONS: { front: BodyRegionCentre[]; back: BodyRegionCentre[] } = {
  front: [
    { name: 'Head', group: 'Head and neck', x: 0.502, y: 0.0467 },
    { name: 'Face', group: 'Head and neck', x: 0.502, y: 0.0957 },
    { name: 'Right eye', group: 'Head and neck', x: 0.4635, y: 0.0855 },
    { name: 'Left eye', group: 'Head and neck', x: 0.5375, y: 0.0855 },
    { name: 'Right ear', group: 'Head and neck', x: 0.403, y: 0.0879 },
    { name: 'Left ear', group: 'Head and neck', x: 0.5975, y: 0.0879 },
    { name: 'Neck', group: 'Head and neck', x: 0.4985, y: 0.1576 },
    { name: 'Right shoulder', group: 'Torso', x: 0.298, y: 0.2488 },
    { name: 'Left shoulder', group: 'Torso', x: 0.7, y: 0.2488 },
    { name: 'Chest', group: 'Torso', x: 0.504, y: 0.259 },
    { name: 'Abdomen', group: 'Torso', x: 0.503, y: 0.3938 },
    { name: 'Right hip', group: 'Torso', x: 0.3965, y: 0.4898 },
    { name: 'Left hip', group: 'Torso', x: 0.6025, y: 0.4898 },
    { name: 'Groin', group: 'Torso', x: 0.4995, y: 0.4895 },
    { name: 'Right upper arm', group: 'Right arm', x: 0.2755, y: 0.3229 },
    { name: 'Right elbow', group: 'Right arm', x: 0.2515, y: 0.3824 },
    { name: 'Right forearm', group: 'Right arm', x: 0.223, y: 0.4574 },
    { name: 'Right wrist', group: 'Right arm', x: 0.2, y: 0.5305 },
    { name: 'Right hand', group: 'Right arm', x: 0.1845, y: 0.5781 },
    { name: 'Left upper arm', group: 'Left arm', x: 0.724, y: 0.3229 },
    { name: 'Left elbow', group: 'Left arm', x: 0.7485, y: 0.3824 },
    { name: 'Left forearm', group: 'Left arm', x: 0.7725, y: 0.4574 },
    { name: 'Left wrist', group: 'Left arm', x: 0.8, y: 0.5305 },
    { name: 'Left hand', group: 'Left arm', x: 0.814, y: 0.5781 },
    { name: 'Right thigh', group: 'Right leg', x: 0.414, y: 0.601 },
    { name: 'Right knee', group: 'Right leg', x: 0.403, y: 0.7086 },
    { name: 'Right lower leg', group: 'Right leg', x: 0.4045, y: 0.8074 },
    { name: 'Right ankle', group: 'Right leg', x: 0.398, y: 0.9019 },
    { name: 'Right foot', group: 'Right leg', x: 0.391, y: 0.9464 },
    { name: 'Left thigh', group: 'Left leg', x: 0.5935, y: 0.601 },
    { name: 'Left knee', group: 'Left leg', x: 0.597, y: 0.7086 },
    { name: 'Left lower leg', group: 'Left leg', x: 0.595, y: 0.8074 },
    { name: 'Left ankle', group: 'Left leg', x: 0.602, y: 0.9019 },
    { name: 'Left foot', group: 'Left leg', x: 0.61, y: 0.9464 },
  ],
  back: [
    { name: 'Back of head', group: 'Head and neck', x: 0.5005, y: 0.0821 },
    { name: 'Right ear', group: 'Head and neck', x: 0.5975, y: 0.0879 },
    { name: 'Left ear', group: 'Head and neck', x: 0.403, y: 0.0879 },
    { name: 'Back of neck', group: 'Head and neck', x: 0.4985, y: 0.156 },
    { name: 'Right shoulder', group: 'Torso', x: 0.7, y: 0.2488 },
    { name: 'Left shoulder', group: 'Torso', x: 0.298, y: 0.2488 },
    { name: 'Upper back', group: 'Torso', x: 0.4995, y: 0.2643 },
    { name: 'Lower back', group: 'Torso', x: 0.503, y: 0.4067 },
    { name: 'Right buttock', group: 'Torso', x: 0.577, y: 0.5119 },
    { name: 'Left buttock', group: 'Torso', x: 0.4235, y: 0.5119 },
    { name: 'Back of right upper arm', group: 'Right arm', x: 0.724, y: 0.3229 },
    { name: 'Right elbow', group: 'Right arm', x: 0.7485, y: 0.3824 },
    { name: 'Back of right forearm', group: 'Right arm', x: 0.7725, y: 0.4574 },
    { name: 'Right wrist', group: 'Right arm', x: 0.8, y: 0.5305 },
    { name: 'Back of right hand', group: 'Right arm', x: 0.814, y: 0.5781 },
    { name: 'Back of left upper arm', group: 'Left arm', x: 0.2755, y: 0.3229 },
    { name: 'Left elbow', group: 'Left arm', x: 0.2515, y: 0.3824 },
    { name: 'Back of left forearm', group: 'Left arm', x: 0.223, y: 0.4574 },
    { name: 'Left wrist', group: 'Left arm', x: 0.2, y: 0.5305 },
    { name: 'Back of left hand', group: 'Left arm', x: 0.1845, y: 0.5781 },
    { name: 'Back of right thigh', group: 'Right leg', x: 0.5935, y: 0.6198 },
    { name: 'Back of right knee', group: 'Right leg', x: 0.597, y: 0.7086 },
    { name: 'Right calf', group: 'Right leg', x: 0.595, y: 0.8074 },
    { name: 'Right ankle', group: 'Right leg', x: 0.602, y: 0.9019 },
    { name: 'Right heel', group: 'Right leg', x: 0.603, y: 0.9345 },
    { name: 'Back of left thigh', group: 'Left leg', x: 0.404, y: 0.615 },
    { name: 'Back of left knee', group: 'Left leg', x: 0.403, y: 0.7086 },
    { name: 'Left calf', group: 'Left leg', x: 0.4045, y: 0.8074 },
    { name: 'Left ankle', group: 'Left leg', x: 0.398, y: 0.9019 },
    { name: 'Left heel', group: 'Left leg', x: 0.399, y: 0.9345 },
  ],
};
