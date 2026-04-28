import type { DemoApplicantRow } from "@/data/demo-portal";
import { createInitialRentalWizardState } from "@/lib/rental-application/state";
import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import { readManagerApplicationRows, writeManagerApplicationRows } from "@/lib/manager-applications-storage";

const PRAKRIT_APPLICATION_EMAILS = new Set(["prakritramachandran@gmai.com", "prakritramachandran@gmail.com"]);
const BROOKLYN_PROPERTY_ID = "mgr-seed-5259-brooklyn-ave-ne";
const BROOKLYN_PROPERTY_LABEL = "5259 Brooklyn Ave NE · 9 rooms";
const BROOKLYN_ROOM_PREFIX = "seed-5259-brooklyn-room-";

type SpreadsheetSeed = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  ssn: string;
  driversLicense: string;
  property: string;
  roomChoice1: string;
  roomChoice2?: string;
  roomChoice3?: string;
  leaseTerm: string;
  leaseStart: string;
  leaseEnd: string;
  currentStreet: string;
  currentCity: string;
  currentState: string;
  currentZip: string;
  currentLandlordName: string;
  currentLandlordPhone: string;
  currentMoveIn: string;
  currentMoveOut: string;
  currentReasonLeaving: string;
  employer: string;
  employerAddress: string;
  supervisorName: string;
  supervisorPhone: string;
  jobTitle: string;
  monthlyIncome: string;
  annualIncome: string;
  employmentStart: string;
  ref1Name: string;
  ref1Relationship: string;
  ref1Phone: string;
  ref2Name: string;
  ref2Relationship: string;
  ref2Phone: string;
  occupancyCount: string;
  evictionHistory: "yes" | "no";
  bankruptcyHistory: "yes" | "no";
  criminalHistory: "yes" | "no";
  digitalSignature: string;
  dateSigned: string;
  rawNotes?: string;
  detail: string;
};

function roomChoice(roomNumber: number): string {
  return `${BROOKLYN_PROPERTY_ID}${LISTING_ROOM_CHOICE_SEP}${BROOKLYN_ROOM_PREFIX}${roomNumber}`;
}

function parseGroupBlock(rawNotes: string | undefined): Pick<ReturnType<typeof createInitialRentalWizardState>, "applyingAsGroup" | "groupRole" | "groupId" | "groupSize"> {
  const notes = rawNotes?.trim() ?? "";
  if (!notes) return { applyingAsGroup: null, groupRole: null, groupId: "", groupSize: "" };
  const groupId = notes.match(/AXIS_GROUP_APP_ID:([^\n\r]+)/)?.[1]?.trim() ?? notes.match(/GROUP ID \(share with roommates\):([^\n\r]+)/)?.[1]?.trim() ?? "";
  const role = notes.match(/AXIS_GROUP_ROLE:([^\n\r]+)/)?.[1]?.trim().toLowerCase() ?? "";
  const size = notes.match(/AXIS_GROUP_SIZE:([^\n\r]+)/)?.[1]?.trim() ?? notes.match(/Expected number of people in group:\s*([^\n\r]+)/)?.[1]?.trim() ?? "";
  return {
    applyingAsGroup: groupId ? "yes" : null,
    groupRole: role === "first" ? "first" : role === "member" || role === "joining" ? "joining" : null,
    groupId,
    groupSize: size,
  };
}

function buildApplication(seed: SpreadsheetSeed) {
  const initial = createInitialRentalWizardState();
  const group = parseGroupBlock(seed.rawNotes);
  return {
    ...initial,
    ...group,
    propertyId: BROOKLYN_PROPERTY_ID,
    roomChoice1: seed.roomChoice1,
    roomChoice2: seed.roomChoice2 ?? "",
    roomChoice3: seed.roomChoice3 ?? "",
    leaseTerm: seed.leaseTerm,
    leaseStart: seed.leaseStart,
    leaseEnd: seed.leaseEnd,
    fullLegalName: seed.name,
    dateOfBirth: seed.dateOfBirth,
    ssn: seed.ssn,
    driversLicense: seed.driversLicense,
    phone: seed.phone,
    email: seed.email,
    currentStreet: seed.currentStreet,
    currentCity: seed.currentCity,
    currentState: seed.currentState,
    currentZip: seed.currentZip,
    currentLandlordName: seed.currentLandlordName,
    currentLandlordPhone: seed.currentLandlordPhone,
    currentMoveIn: seed.currentMoveIn,
    currentMoveOut: seed.currentMoveOut,
    currentReasonLeaving: seed.currentReasonLeaving,
    employer: seed.employer,
    employerAddress: seed.employerAddress,
    supervisorName: seed.supervisorName,
    supervisorPhone: seed.supervisorPhone,
    jobTitle: seed.jobTitle,
    monthlyIncome: seed.monthlyIncome,
    annualIncome: seed.annualIncome,
    employmentStart: seed.employmentStart,
    ref1Name: seed.ref1Name,
    ref1Relationship: seed.ref1Relationship,
    ref1Phone: seed.ref1Phone,
    ref2Name: seed.ref2Name,
    ref2Relationship: seed.ref2Relationship,
    ref2Phone: seed.ref2Phone,
    occupancyCount: seed.occupancyCount,
    evictionHistory: seed.evictionHistory,
    bankruptcyHistory: seed.bankruptcyHistory,
    criminalHistory: seed.criminalHistory,
    consentCredit: true,
    consentTruth: true,
    digitalSignature: seed.digitalSignature,
    dateSigned: seed.dateSigned,
    applicationFeeAcknowledged: true,
  };
}

function buildSeedRows(managerUserId: string): DemoApplicantRow[] {
  const seeds: SpreadsheetSeed[] = [
    {
      id: "AXIS-L52LZTST",
      name: "Fathima Shaikh",
      email: "fathimashaikh318@gmail.com",
      phone: "(312) 714-7974",
      dateOfBirth: "3/18/2005",
      ssn: "342-04-6480",
      driversLicense: "s200-2570-5680",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(6),
      leaseTerm: "3-Month",
      leaseStart: "5/24/2026",
      leaseEnd: "8/16/2026",
      currentStreet: "2021 Channing Way",
      currentCity: "Berkeley",
      currentState: "CA",
      currentZip: "94704",
      currentLandlordName: "Vindium Real Estate",
      currentLandlordPhone: "(312) 714-7974",
      currentMoveIn: "8/15/2024",
      currentMoveOut: "12/15/2026",
      currentReasonLeaving: "grad",
      employer: "Microsoft",
      employerAddress: "One Microsoft Way, Redmond, WA 98052-7329, USA",
      supervisorName: "N/A don't know yet",
      supervisorPhone: "(425) 882-8080",
      jobTitle: "Product Manger",
      monthlyIncome: "$8,500.00",
      annualIncome: "$102,000.00",
      employmentStart: "5/26/2026",
      ref1Name: "Karolina",
      ref1Relationship: "Coworker",
      ref1Phone: "(224) 242-0501",
      ref2Name: "Grace",
      ref2Relationship: "supervisor",
      ref2Phone: "(832) 606-8409",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "fathima shaikh",
      dateSigned: "4/9/2026",
      rawNotes: "n/a",
      detail: "Imported from spreadsheet · signed 4/9/2026",
    },
    {
      id: "AXIS-NNELGWQH",
      name: "Arnav Shanbhag",
      email: "arnavjs78@gmail.com",
      phone: "(814) 810-7714",
      dateOfBirth: "12/28/2005",
      ssn: "356049699",
      driversLicense: "900001044321",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(2),
      leaseTerm: "3-Month",
      leaseStart: "5/23/2026",
      leaseEnd: "8/23/2026",
      currentStreet: "519 Onondaga St",
      currentCity: "Ann Arbor",
      currentState: "MI",
      currentZip: "48104",
      currentLandlordName: "None",
      currentLandlordPhone: "",
      currentMoveIn: "",
      currentMoveOut: "",
      currentReasonLeaving: "",
      employer: "Pacific Northwest National Laboratory",
      employerAddress: "3335 Innovation Dr, Richland, WA 99354",
      supervisorName: "Wilson Fearn",
      supervisorPhone: "",
      jobTitle: "Intern",
      monthlyIncome: "$5,000.00",
      annualIncome: "$25,000.00",
      employmentStart: "5/26/2026",
      ref1Name: "Uday Shanbhag",
      ref1Relationship: "Father",
      ref1Phone: "(217) 840-5126",
      ref2Name: "Aparna Joshi",
      ref2Relationship: "Mother",
      ref2Phone: "(217) 840-7835",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Arnav Shanbhag",
      dateSigned: "4/8/2026",
      detail: "Imported from spreadsheet · signed 4/8/2026",
    },
    {
      id: "AXIS-JEWOOKPA",
      name: "Jewook Park",
      email: "jewook.parkder@gmail.com",
      phone: "(404) 610-9875",
      dateOfBirth: "8/13/2003",
      ssn: "",
      driversLicense: "M194G68N9 (Passport ID)",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: "",
      leaseTerm: "3-Month",
      leaseStart: "5/1/2026",
      leaseEnd: "8/14/2026",
      currentStreet: "1107 Mecaslin St NW",
      currentCity: "Atlanta",
      currentState: "GA",
      currentZip: "30318",
      currentLandlordName: "Nilesh Shah",
      currentLandlordPhone: "(404) 468-5840",
      currentMoveIn: "8/1/2025",
      currentMoveOut: "5/1/2026",
      currentReasonLeaving: "Moving to another apartment",
      employer: "Microsoft",
      employerAddress: "3600 157th Avenue NE, Redmond, WA 98052",
      supervisorName: "Sandeep Repaka",
      supervisorPhone: "(425) 882-8080",
      jobTitle: "Principal Software Engineering Manager",
      monthlyIncome: "$8,458.00",
      annualIncome: "",
      employmentStart: "5/18/2026",
      ref1Name: "David Yoo",
      ref1Relationship: "Friend",
      ref1Phone: "(470) 435-0570",
      ref2Name: "Kim Seungmin Yu",
      ref2Relationship: "Friend",
      ref2Phone: "",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Jewook Park",
      dateSigned: "3/30/2026",
      detail: "Imported from PDF · Brooklyn application signed 3/30/2026",
    },
    {
      id: "AXIS-DAVIDYOO",
      name: "David Hyungchan Yoo",
      email: "davidhyoo1@gmail.com",
      phone: "(470) 435-0530",
      dateOfBirth: "1/24/2001",
      ssn: "761-19-0665",
      driversLicense: "070117931",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: "",
      leaseTerm: "3-Month",
      leaseStart: "5/14/2026",
      leaseEnd: "8/14/2026",
      currentStreet: "1107 Mecaslin St NW",
      currentCity: "Atlanta",
      currentState: "GA",
      currentZip: "30318",
      currentLandlordName: "Nilesh Shah",
      currentLandlordPhone: "(404) 468-5840",
      currentMoveIn: "8/1/2025",
      currentMoveOut: "7/31/2026",
      currentReasonLeaving: "Sublease for internship",
      employer: "Microsoft",
      employerAddress: "One Microsoft Way, Redmond, WA 98052",
      supervisorName: "Kaitlin Krause",
      supervisorPhone: "(425) 882-8080",
      jobTitle: "Supply Chain Planner Intern",
      monthlyIncome: "",
      annualIncome: "$81,840.00",
      employmentStart: "5/18/2026",
      ref1Name: "Jewook Park",
      ref1Relationship: "Friend",
      ref1Phone: "(404) 610-9875",
      ref2Name: "Christine Yoo",
      ref2Relationship: "Friend",
      ref2Phone: "(602) 620-6275",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "David Yoo",
      dateSigned: "3/30/2026",
      detail: "Imported from PDF · Brooklyn application signed 3/30/2026",
    },
    {
      id: "AXIS-KGD8JWSJ",
      name: "Connor D Federico Grome",
      email: "connorgrome89@gmail.com",
      phone: "(774) 270-2926",
      dateOfBirth: "5/11/2005",
      ssn: "025-88-7735",
      driversLicense: "SA6540073",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(3),
      roomChoice2: roomChoice(5),
      leaseTerm: "3-Month",
      leaseStart: "6/14/2026",
      leaseEnd: "9/5/2026",
      currentStreet: "22 Walden Drive",
      currentCity: "Natick",
      currentState: "MA",
      currentZip: "1760",
      currentLandlordName: "Jon Wangler",
      currentLandlordPhone: "(508) 655-5500",
      currentMoveIn: "5/11/2005",
      currentMoveOut: "4/15/2026",
      currentReasonLeaving: "Still live there",
      employer: "Amazon Web Services",
      employerAddress: "2205 7th Ave, Seattle, WA, 98121",
      supervisorName: "Brett Laffel",
      supervisorPhone: "(000) 000-0000",
      jobTitle: "General Marketing Specialist Intern",
      monthlyIncome: "$6,683.00",
      annualIncome: "$0.00",
      employmentStart: "6/15/2026",
      ref1Name: "Julie Russel",
      ref1Relationship: "Friend / Classmate",
      ref1Phone: "(225) 773-3212",
      ref2Name: "Ahron Springer",
      ref2Relationship: "Friend / Classmate",
      ref2Phone: "(718) 551-7849",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Connor D Federico-Grome",
      dateSigned: "4/15/2026",
      rawNotes: "Applying as a group: No\n\n--- Room preferences ---\n1st choice: Room 3\n2nd choice: Room 5\n--- End room preferences ---",
      detail: "Imported from spreadsheet · signed 4/15/2026",
    },
    {
      id: "AXIS-AVUA6UPM",
      name: "Kavinu Weerawardhene",
      email: "Kavinuj753@gmail.com",
      phone: "(952) 290-3970",
      dateOfBirth: "7/15/2005",
      ssn: "475-53-3244",
      driversLicense: "M000041700200",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(3),
      roomChoice2: roomChoice(4),
      roomChoice3: roomChoice(5),
      leaseTerm: "3-Month",
      leaseStart: "5/20/2026",
      leaseEnd: "8/22/2026",
      currentStreet: "101 North Brooks Street",
      currentCity: "Madison",
      currentState: "WI",
      currentZip: "53715",
      currentLandlordName: "Rouse Management",
      currentLandlordPhone: "(608) 255-4744",
      currentMoveIn: "8/15/2025",
      currentMoveOut: "8/15/2026",
      currentReasonLeaving: "New Living Spot for College.",
      employer: "Morgridge Institute for Research",
      employerAddress: "330 N Orchard St",
      supervisorName: "Carlos Frits",
      supervisorPhone: "(746) 492-8131",
      jobTitle: "Student Lab Assistant",
      monthlyIncome: "$900.00",
      annualIncome: "$10,800.00",
      employmentStart: "1/20/2025",
      ref1Name: "Patrick Grunklee",
      ref1Relationship: "Colleague",
      ref1Phone: "(612) 479-7924",
      ref2Name: "Devmini Jayatilaka",
      ref2Relationship: "Colleague",
      ref2Phone: "(612) 425-8884",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Kavinu Weerawardhene",
      dateSigned: "4/15/2026",
      rawNotes:
        "--- Household group (Axis) ---\nApplying as a group: Yes\nGroup applicant role: First to apply (primary)\nExpected number of people in group: 5\nGROUP ID (share with roommates): AXISGRP-P45NRJL764WE\nAXIS_GROUP_APP_ID:AXISGRP-P45NRJL764WE\nAXIS_GROUP_ROLE:first\nAXIS_GROUP_SIZE:5\n--- End household group ---\n\n--- Room preferences ---\n1st choice: Room 3\n2nd choice: Room 4\n3rd choice: Room 5\n--- End room preferences ---",
      detail: "Imported from spreadsheet · signed 4/15/2026",
    },
    {
      id: "AXIS-LUEW7J5G",
      name: "David Macaraig",
      email: "davidjmacaraig@gmail.com",
      phone: "(925) 890-4537",
      dateOfBirth: "5/30/2004",
      ssn: "615-45-4844",
      driversLicense: "Y7168230",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(1),
      roomChoice2: roomChoice(2),
      roomChoice3: roomChoice(5),
      leaseTerm: "3-Month",
      leaseStart: "5/22/2026",
      leaseEnd: "8/21/2026",
      currentStreet: "5061 Art Street",
      currentCity: "San Diego",
      currentState: "CA",
      currentZip: "92115",
      currentLandlordName: "",
      currentLandlordPhone: "",
      currentMoveIn: "8/26/2024",
      currentMoveOut: "5/13/2026",
      currentReasonLeaving: "Work",
      employer: "Pfizer",
      employerAddress: "21823 30th Dr SE Bothell WA 98021 United States",
      supervisorName: "Bianca Ramdath",
      supervisorPhone: "(212) 557-9545",
      jobTitle: "CRD/ARD",
      monthlyIncome: "$4,640.00",
      annualIncome: "$55,680.00",
      employmentStart: "5/26/2026",
      ref1Name: "Kavinu Weerawaradhene",
      ref1Relationship: "Colleague",
      ref1Phone: "(952) 290-3970",
      ref2Name: "Ryan Gribble",
      ref2Relationship: "Colleague",
      ref2Phone: "(850) 830-8483",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "David Macaraig",
      dateSigned: "4/15/2026",
      rawNotes:
        "--- Household group (Axis) ---\nApplying as a group: Yes\nGroup applicant role: Joining with Group ID\nGROUP ID (share with roommates): AXISGRP-P45NRJL764WE\nAXIS_GROUP_APP_ID:AXISGRP-P45NRJL764WE\nAXIS_GROUP_ROLE:member\n--- End household group ---\n\n--- Room preferences ---\n1st choice: Room 1\n2nd choice: Room 2\n3rd choice: Room 5\n--- End room preferences ---",
      detail: "Imported from spreadsheet · signed 4/15/2026",
    },
    {
      id: "AXIS-PLDGTIPM",
      name: "Tatva Prasad",
      email: "tatvapra@usc.edu",
      phone: "(510) 399-3322",
      dateOfBirth: "7/29/2006",
      ssn: "156-72-1516",
      driversLicense: "Y7036608",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(4),
      leaseTerm: "3-Month",
      leaseStart: "5/22/2026",
      leaseEnd: "8/16/2026",
      currentStreet: "3131 S Hoover St",
      currentCity: "Los Angeles",
      currentState: "CA",
      currentZip: "90089",
      currentLandlordName: "USC",
      currentLandlordPhone: "",
      currentMoveIn: "8/18/2025",
      currentMoveOut: "5/16/2026",
      currentReasonLeaving: "End of school term",
      employer: "Pfizer",
      employerAddress: "2500 223rd St SE",
      supervisorName: "Noah Theiss",
      supervisorPhone: "(425) 527-4000",
      jobTitle: "Research and Development",
      monthlyIncome: "$4,480.00",
      annualIncome: "$53,760.00",
      employmentStart: "5/15/2026",
      ref1Name: "Vaahin Mehta",
      ref1Relationship: "Roommate",
      ref1Phone: "(630) 785-0826",
      ref2Name: "Nitin Davuluri",
      ref2Relationship: "Roommate",
      ref2Phone: "(904) 805-2953",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Tatva Prasad",
      dateSigned: "4/15/2026",
      rawNotes:
        "--- Household group (Axis) ---\nApplying as a group: Yes\nGroup applicant role: Joining with Group ID\nGROUP ID (share with roommates): AXISGRP-P45NRJL764WE\nAXIS_GROUP_APP_ID:AXISGRP-P45NRJL764WE\nAXIS_GROUP_ROLE:member\n--- End household group ---",
      detail: "Imported from spreadsheet · signed 4/15/2026",
    },
    {
      id: "AXIS-EDEK0E02",
      name: "Ryan Gribble",
      email: "ryan.d.gribble@gmail.com",
      phone: "(850) 830-8483",
      dateOfBirth: "2/18/2004",
      ssn: "765-38-5610",
      driversLicense: "G614-724-04-058-0",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(4),
      roomChoice2: roomChoice(5),
      roomChoice3: roomChoice(8),
      leaseTerm: "3-Month",
      leaseStart: "5/23/2026",
      leaseEnd: "8/21/2026",
      currentStreet: "4503 Sandhurst Drive",
      currentCity: "Orlando",
      currentState: "FL",
      currentZip: "32817",
      currentLandlordName: "Joey Gong",
      currentLandlordPhone: "(407) 409-3429",
      currentMoveIn: "7/15/2024",
      currentMoveOut: "7/15/2026",
      currentReasonLeaving: "I’m moving for work.",
      employer: "Pfizer",
      employerAddress: "21823 30th Dr SE Bothell Wa 98021",
      supervisorName: "Bianca Ramdath",
      supervisorPhone: "(212) 557-9545",
      jobTitle: "Summer 2026 Pfizer Research and Development Internship",
      monthlyIncome: "$4,640.00",
      annualIncome: "$55,680.00",
      employmentStart: "5/26/2026",
      ref1Name: "Anthony Ficaro",
      ref1Relationship: "Colleague",
      ref1Phone: "(630) 550-9325",
      ref2Name: "Sydney Baker",
      ref2Relationship: "Colleague",
      ref2Phone: "(850) 206-9717",
      occupancyCount: "5",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Ryan Gribble",
      dateSigned: "4/16/2026",
      rawNotes:
        "--- Household group (Axis) ---\nApplying as a group: Yes\nGroup applicant role: Joining with Group ID\nGROUP ID (share with roommates): AXISGRP-P45NRJL764WE\nAXIS_GROUP_APP_ID:AXISGRP-P45NRJL764WE\nAXIS_GROUP_ROLE:member\n--- End household group ---\n\n--- Room preferences ---\n1st choice: Room 4\n2nd choice: Room 5\n3rd choice: Room 8\n--- End room preferences ---",
      detail: "Imported from spreadsheet · signed 4/16/2026",
    },
    {
      id: "AXIS-VRH8COLT",
      name: "Wesley Taylor",
      email: "wbtaylor002@gmail.com",
      phone: "(704) 307-5286",
      dateOfBirth: "2/4/2005",
      ssn: "655-20-2401",
      driversLicense: "47038418",
      property: BROOKLYN_PROPERTY_LABEL,
      roomChoice1: roomChoice(5),
      roomChoice2: roomChoice(4),
      roomChoice3: roomChoice(6),
      leaseTerm: "3-Month",
      leaseStart: "5/21/2026",
      leaseEnd: "8/15/2026",
      currentStreet: "809 East Franklin Street",
      currentCity: "Chapel Hill",
      currentState: "NC",
      currentZip: "27514",
      currentLandlordName: "",
      currentLandlordPhone: "",
      currentMoveIn: "8/17/2025",
      currentMoveOut: "5/11/2026",
      currentReasonLeaving: "Internship",
      employer: "Pfizer",
      employerAddress: "21823 30th Dr SE Bothell WA 98021 United States",
      supervisorName: "",
      supervisorPhone: "",
      jobTitle: "",
      monthlyIncome: "",
      annualIncome: "",
      employmentStart: "",
      ref1Name: "Mihir Upadhye",
      ref1Relationship: "Prinicpal Investigator",
      ref1Phone: "(805) 443-1675",
      ref2Name: "Steven Mantekas",
      ref2Relationship: "High School Boss",
      ref2Phone: "(704) 560-5757",
      occupancyCount: "1",
      evictionHistory: "no",
      bankruptcyHistory: "no",
      criminalHistory: "no",
      digitalSignature: "Wesley Taylor",
      dateSigned: "4/15/2026",
      rawNotes:
        "--- Household group (Axis) ---\nApplying as a group: Yes\nGroup applicant role: Joining with Group ID\nGROUP ID (share with roommates): AXISGRP-P45NRJL764WE\nAXIS_GROUP_APP_ID:AXISGRP-P45NRJL764WE\nAXIS_GROUP_ROLE:member\n--- End household group ---\n\n--- Room preferences ---\n1st choice: Room 5\n2nd choice: Room 4\n3rd choice: Room 6\n--- End room preferences ---",
      detail: "Imported from spreadsheet · signed 4/15/2026",
    },
  ];

  return seeds.map((seed) => ({
    id: seed.id,
    name: seed.name,
    property: seed.property,
    propertyId: BROOKLYN_PROPERTY_ID,
    managerUserId,
    stage: "Submitted",
    bucket: "pending",
    email: seed.email,
    detail: seed.detail,
    application: buildApplication(seed),
  }));
}

export function ensureAccountApplicationSeeds(userId: string | null, email: string | null): boolean {
  if (!userId || !email || !PRAKRIT_APPLICATION_EMAILS.has(email.trim().toLowerCase())) return false;
  const existing = readManagerApplicationRows();
  const byId = new Map(existing.map((row) => [row.id, row]));
  const seeded = buildSeedRows(userId);
  let changed = false;

  const mergedRows = existing.map((row) => {
    const seed = seeded.find((candidate) => candidate.id === row.id);
    if (!seed) return row;
    const merged: DemoApplicantRow = {
      ...seed,
      ...row,
      propertyId: row.propertyId?.trim() || seed.propertyId,
      managerUserId: userId,
      application: row.application ?? seed.application,
    };
    if (JSON.stringify(merged) !== JSON.stringify(row)) changed = true;
    return merged;
  });

  for (const seed of seeded) {
    if (byId.has(seed.id)) continue;
    mergedRows.push(seed);
    changed = true;
  }

  if (changed) writeManagerApplicationRows(mergedRows);
  return changed;
}
