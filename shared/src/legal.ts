/**
 * SaanPaw Terms of Use and Privacy Policy, shown in the mobile app and the Developer Console.
 * Generated from SaanPaw_Terms_of_Use.docx and SaanPaw_Privacy_Policy.docx - edit those documents
 * and regenerate rather than changing the wording here by hand, so both apps stay identical.
 *
 * Inline text uses **bold** and [label](https://link) markup; see `legalInline`.
 */
export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] };

export interface LegalDocument {
  title: string;
  effective: string;
  sections: { title: string; blocks: LegalBlock[] }[];
}

export type LegalInline = { text: string; bold?: boolean; href?: string };

/** Splits **bold** and [label](url) markup into plain pieces both apps can render. */
export function legalInline(text: string): LegalInline[] {
  const out: LegalInline[] = [];
  const pattern = /\*\*(.+?)\*\*|\[(.+?)\]\((https?:\/\/[^)]+)\)/g;
  let last = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const TERMS_OF_USE: LegalDocument = {
  "title": "SaanPaw Terms of Use",
  "effective": "November 12, 2026",
  "sections": [
    {
      "title": "1. Acceptance and Eligibility",
      "blocks": [
        {
          "type": "p",
          "text": "By creating an account or using SaanPaw, you agree to these Terms of Use and to the SaanPaw Privacy Policy. If you do not agree, do not use the system."
        },
        {
          "type": "p",
          "text": "These terms cover the SaanPaw mobile app, the web admin panel and the services behind them. SaanPaw is a lost and found animal platform for San Jose del Monte, Bulacan."
        },
        {
          "type": "ul",
          "items": [
            "You must be at least 18 years old to create a user account. You give your birthday when you register, and accounts are not created for anyone under 18.",
            "You must give true and accurate information when you register.",
            "Reports are accepted only for locations inside SaanPaw’s service area."
          ]
        }
      ]
    },
    {
      "title": "2. Accounts",
      "blocks": [
        {
          "type": "p",
          "text": "**User accounts.** Pet owners and community members can register with a valid email address. You may have only one personal account."
        },
        {
          "type": "p",
          "text": "**Shelter accounts.** Animal shelters and rescue groups must submit proof documents when they register. A shelter account can’t use shelter features until a SaanPaw administrator has approved it. SaanPaw may reject or revoke an approval if the documents are false or the shelter no longer operates."
        },
        {
          "type": "p",
          "text": "**Account security.** You are responsible for keeping your password private and for all activity on your account. Tell us right away if you think someone else has used your account. If you receive a temporary password, change it when you next log in."
        }
      ]
    },
    {
      "title": "3. Reports and Content",
      "blocks": [
        {
          "type": "p",
          "text": "You are responsible for the reports, photos and messages you post (“your content”)."
        },
        {
          "type": "ul",
          "items": [
            "**Be accurate.** Lost pet and found animal reports must be about real animals and real events, with a truthful location and description.",
            "**Use your own photos,** or photos you have permission to use. Upload photos of the animal only, and avoid showing people’s faces, house numbers or other personal details.",
            "**Keep reports up to date.** Mark a report as resolved, or delete it, once the animal is found or returned.",
            "**Ownership.** You keep ownership of your content. By posting it, you give SaanPaw permission to store, display, process (including with AI) and share it with other users and shelters, only for running the system’s features, such as matching and alerts.",
            "**Removal.** SaanPaw may edit, hide or remove content that breaks these terms."
          ]
        }
      ]
    },
    {
      "title": "4. Prohibited Conduct",
      "blocks": [
        {
          "type": "p",
          "text": "When using SaanPaw, you must not:"
        },
        {
          "type": "ul",
          "items": [
            "Post fake, misleading or duplicate reports, or reuse another person’s photos as your own.",
            "Claim an animal that isn’t yours, or use the system to steal, sell or trade animals.",
            "Ask for money, rewards or payment in exchange for returning an animal, except a reward the owner offers freely.",
            "Harass, threaten, scam or abuse other users or shelters, including in messages.",
            "Post offensive, violent, sexual or hateful content, or content showing animal cruelty.",
            "Share another person’s personal information without their consent.",
            "Pretend to be another person, shelter or organization.",
            "Post spam, advertisements or content unrelated to lost and found animals.",
            "Try to get around the service-area limit, a ban or other security measures.",
            "Hack, overload, copy data from or reverse-engineer the system, or upload harmful files."
          ]
        },
        {
          "type": "p",
          "text": "Animal abuse or other crimes may be reported to the proper authorities."
        }
      ]
    },
    {
      "title": "5. Shelter Responsibilities",
      "blocks": [
        {
          "type": "p",
          "text": "Verified shelters agree to:"
        },
        {
          "type": "ul",
          "items": [
            "Keep their shelter profile, contact details and location accurate.",
            "Record rescued animals truthfully and keep each animal’s status up to date (rescued, recovered or returned).",
            "Check that a person claiming an animal is its real owner before releasing it, for example with photos, records or identifying marks.",
            "Respond to messages from owners within a reasonable time.",
            "Use owners’ personal information only to reunite them with their animals.",
            "Follow applicable laws on animal welfare, including the Animal Welfare Act (RA 8485, as amended by RA 10631)."
          ]
        }
      ]
    },
    {
      "title": "6. AI Matching, Location and Notifications",
      "blocks": [
        {
          "type": "p",
          "text": "SaanPaw helps people find animals, but it can’t guarantee that any lost pet will be found."
        },
        {
          "type": "ul",
          "items": [
            "**Matches are suggestions.** AI image recognition and the matching system compare reports and suggest possible matches. They can be wrong. Always confirm an animal’s identity in person before treating a match as final.",
            "**Location accuracy.** GPS locations, addresses, barangays and directions come from your device and outside map services, and may not be exact.",
            "**Notifications.** Push alerts and emails depend on your device settings, internet connection and outside services, and may be delayed or missed. Check the app regularly while your report is active.",
            "**Availability.** SaanPaw may be unavailable at times, for example during maintenance or updates."
          ]
        }
      ]
    },
    {
      "title": "7. Moderation, Suspension and Termination",
      "blocks": [
        {
          "type": "p",
          "text": "To keep SaanPaw trustworthy, reports and photos are screened automatically, and flagged content is reviewed by an administrator."
        },
        {
          "type": "ul",
          "items": [
            "If you break these terms, SaanPaw may remove your content, give you a warning, suspend your account, or ban you permanently.",
            "Banned users may not create new accounts.",
            "A shelter’s approval may be revoked for false documents, misuse of owner information or mistreatment of animals.",
            "You may stop using SaanPaw and delete your account at any time from your Profile, after confirming your password. Deleting your account also deletes its reports, photos and messages, as described in the Privacy Policy.",
            "If you think your content or account was removed by mistake, contact us using the details in Section 9."
          ]
        }
      ]
    },
    {
      "title": "8. Safety, Disclaimers and Limitation of Liability",
      "blocks": [
        {
          "type": "p",
          "text": "**Meeting other users.** SaanPaw connects people but doesn’t take part in meetings or animal handovers. When you meet someone to return or claim an animal:"
        },
        {
          "type": "ul",
          "items": [
            "Meet in a public place or at the shelter, and bring someone with you if possible.",
            "Ask for proof of ownership before handing over an animal.",
            "Never send money in advance to someone claiming to have your pet.",
            "Be careful when handling unfamiliar or injured animals."
          ]
        },
        {
          "type": "p",
          "text": "**Disclaimer.** SaanPaw is provided “as is” and “as available.” We don’t guarantee that the system will be error-free or always available, or that information posted by users and shelters is accurate."
        },
        {
          "type": "p",
          "text": "**Limitation of liability.** To the extent allowed by law, the SaanPaw team is not responsible for:"
        },
        {
          "type": "ul",
          "items": [
            "The actions or content of users and shelters.",
            "Disputes between users, or between users and shelters.",
            "Loss, injury or harm to any animal or person.",
            "Losses caused by inaccurate matches, locations or delayed notifications."
          ]
        },
        {
          "type": "p",
          "text": "Users are responsible for their own dealings with each other."
        }
      ]
    },
    {
      "title": "9. Privacy, Changes, Governing Law and Contact",
      "blocks": [
        {
          "type": "p",
          "text": "**Privacy.** How we collect, use and protect your personal data is explained in the SaanPaw Privacy Policy, which is part of these terms."
        },
        {
          "type": "p",
          "text": "**Changes to these terms.** We may update these terms as SaanPaw changes. The new version will be posted in the app with its effective date. Major changes will be announced by email or in-app notice. If you keep using SaanPaw after a change, you accept the updated terms."
        },
        {
          "type": "p",
          "text": "**Governing law.** These terms are governed by the laws of the Republic of the Philippines, including the Data Privacy Act of 2012 (RA 10173) and the Animal Welfare Act (RA 8485, as amended)."
        },
        {
          "type": "p",
          "text": "**Contact us.** For questions about these terms, reports of misuse or appeals:"
        },
        {
          "type": "ul",
          "items": [
            "Email: dirk.louisse0715@gmail.com",
            "Address: Spine Road, Altaraza Town Center, Barangay Tungkong Mangga, City of San Jose del Monte, Bulacan"
          ]
        }
      ]
    }
  ]
};

export const PRIVACY_POLICY: LegalDocument = {
  "title": "SaanPaw Privacy Policy",
  "effective": "November 12, 2026",
  "sections": [
    {
      "title": "1. Introduction",
      "blocks": [
        {
          "type": "p",
          "text": "SaanPaw collects only the personal data needed to reunite lost pets with their owners and connect found animals with shelters. We handle that data in line with the Data Privacy Act of 2012 (Republic Act No. 10173) and the rules of the National Privacy Commission (NPC)."
        },
        {
          "type": "p",
          "text": "This policy covers the SaanPaw mobile app (for pet owners, community users and animal shelters), the SaanPaw web admin panel, and the backend services behind them. By creating an account or submitting a report, you agree to the practices described here."
        }
      ]
    },
    {
      "title": "2. Information We Collect",
      "blocks": [
        {
          "type": "p",
          "text": "We collect information you give us, plus a small amount generated when you use the app."
        },
        {
          "type": "table",
          "head": [
            "Type",
            "Examples",
            "Who it comes from"
          ],
          "rows": [
            [
              "Account information",
              "Name, email address, password (stored encrypted), contact number, role (user or shelter)",
              "Users and shelters"
            ],
            [
              "Shelter details",
              "Shelter name, address, contact person, proof documents for verification",
              "Shelters"
            ],
            [
              "Lost pet reports",
              "Pet name, species, breed, color, markings, date and place last seen, photos",
              "Pet owners"
            ],
            [
              "Found animal reports",
              "Description, condition, photos, location found",
              "Community users"
            ],
            [
              "Shelter animal records",
              "Rescued animal details, photos, status (rescued, recovered, returned)",
              "Shelters"
            ],
            [
              "Location data",
              "GPS coordinates of reports, barangay, your location when using the map",
              "Users and shelters"
            ],
            [
              "Messages",
              "Conversations between users and shelters",
              "Users and shelters"
            ],
            [
              "Device information",
              "Push notification token, device type",
              "Your device"
            ],
            [
              "Activity records",
              "Notifications sent, match suggestions, moderation flags",
              "Generated by the system"
            ]
          ]
        }
      ]
    },
    {
      "title": "3. How We Use Your Information",
      "blocks": [
        {
          "type": "p",
          "text": "We use your information only to run SaanPaw’s core features:"
        },
        {
          "type": "ul",
          "items": [
            "**Accounts:** to register you, log you in and keep your session secure.",
            "**Reports:** to publish lost pet and found animal reports so others can help.",
            "**Matching:** to compare lost reports with found reports and shelter animals and suggest possible matches.",
            "**Alerts:** to send notifications, push alerts and emails about matches, status changes and messages.",
            "**Messaging:** to let pet owners and shelters talk to each other.",
            "**Shelter verification:** to review proof documents before a shelter account is approved.",
            "**Safety and moderation:** to detect spam, fake or harmful reports and duplicate photos, and to block banned accounts.",
            "**Statistics:** to show totals (reports, rescues, recoveries) on dashboards. These figures do not identify you."
          ]
        },
        {
          "type": "p",
          "text": "We do not sell your personal data, and we do not use it for advertising."
        }
      ]
    },
    {
      "title": "4. Location Data",
      "blocks": [
        {
          "type": "p",
          "text": "Location is central to SaanPaw, so we ask for it only when a feature needs it, and only with your permission."
        },
        {
          "type": "ul",
          "items": [
            "**Service area check:** we confirm that reports fall inside SaanPaw’s service area.",
            "**Barangay lookup:** we convert a report’s coordinates into a barangay and address.",
            "**Map and search:** we use your location to show nearby reports and shelters.",
            "**Directions:** we use your location and the destination to plan a route to a shelter or report."
          ]
        },
        {
          "type": "p",
          "text": "We do not track your location in the background. You can turn off location access in your phone’s settings, but reporting and map features may not work without it."
        }
      ]
    },
    {
      "title": "5. Photos and AI Processing",
      "blocks": [
        {
          "type": "p",
          "text": "Photos you upload are processed automatically to help find matches and keep the platform safe."
        },
        {
          "type": "ul",
          "items": [
            "**Image recognition:** animal photos are sent to Google’s Gemini AI to describe the animal (species, breed, color, markings) and compare it with other reports.",
            "**Duplicate detection:** we create a digital fingerprint of each photo to spot reused or stolen images.",
            "**Content moderation:** report text and photos are screened by AI for spam, inappropriate content or fake reports. Flagged items are reviewed by a SaanPaw administrator before any action is taken against your account."
          ]
        },
        {
          "type": "p",
          "text": "Please upload photos of animals only, and avoid photos that show people’s faces, house numbers or other personal details."
        }
      ]
    },
    {
      "title": "6. Sharing and Visibility",
      "blocks": [
        {
          "type": "p",
          "text": "Some of your information is visible to other SaanPaw users so that lost animals can be found."
        },
        {
          "type": "table",
          "head": [
            "Who sees it",
            "What they see"
          ],
          "rows": [
            [
              "Other users and shelters",
              "Report details, animal photos, barangay and map location of the report"
            ],
            [
              "The shelter or user you message",
              "Your name and the messages you send"
            ],
            [
              "Verified shelters",
              "Reports in their area and match suggestions involving their animals"
            ],
            [
              "SaanPaw administrators",
              "Account details, reports, shelter documents and flagged content, for verification and moderation"
            ]
          ]
        },
        {
          "type": "p",
          "text": "We also share data with service providers that help run SaanPaw, only as far as each one needs:"
        },
        {
          "type": "ul",
          "items": [
            "**Google Gemini:** image recognition and content moderation",
            "**Map and geocoding services:** barangay lookup and directions",
            "**Push notification service (Firebase / Expo):** delivering alerts to your phone",
            "**Email service:** account and alert emails",
            "**Cloud hosting, database and file storage:** storing your account, reports and photos"
          ]
        },
        {
          "type": "p",
          "text": "We may disclose information when required by law, a court order or a government authority, or to protect someone’s safety."
        }
      ]
    },
    {
      "title": "7. Data Retention and Deletion",
      "blocks": [
        {
          "type": "p",
          "text": "We keep your data only as long as your account is active or as needed to provide SaanPaw’s services."
        },
        {
          "type": "ul",
          "items": [
            "Reports stay visible until they are resolved, removed by you, or removed by an administrator.",
            "When an account or report is deleted, its linked photos, messages, notifications and match suggestions are deleted with it.",
            "If a shelter is caring for an animal that came from a deleted user's report, the animal stays in the shelter's care as a stray. Its link to the deleted account, report and case is removed, along with the owner's name and contact number.",
            "Records needed for legal, security or moderation reasons (for example, a ban record) may be kept for a limited time after deletion."
          ]
        },
        {
          "type": "p",
          "text": "You can delete your reports in the app or ask us to delete your account at any time (see Section 10)."
        }
      ]
    },
    {
      "title": "8. Security",
      "blocks": [
        {
          "type": "p",
          "text": "We use reasonable organizational, physical and technical measures to protect your data:"
        },
        {
          "type": "ul",
          "items": [
            "Passwords are stored as one-way encrypted hashes, never as plain text.",
            "Logins use secure tokens, stored on your device, that expire.",
            "Data travels between the app and our servers over encrypted connections (HTTPS).",
            "Only authorized administrators can access account and moderation data.",
            "Uploaded files are checked for type and size before they are stored."
          ]
        },
        {
          "type": "p",
          "text": "No system is completely secure. If a breach affects your personal data, we will notify you and the National Privacy Commission as the Data Privacy Act requires."
        }
      ]
    },
    {
      "title": "9. Your Rights",
      "blocks": [
        {
          "type": "p",
          "text": "Under the Data Privacy Act of 2012, you have the right to:"
        },
        {
          "type": "ul",
          "items": [
            "**Be informed** about how your personal data is collected and used.",
            "**Access** the personal data we hold about you.",
            "**Correct** inaccurate or outdated data. You can edit most of it in your profile.",
            "**Object** to processing, and **withdraw consent** at any time.",
            "**Erasure or blocking** of your data when it is no longer needed or was processed unlawfully.",
            "**Data portability:** get a copy of your data in a common format.",
            "**Damages** if you are harmed by inaccurate or unlawfully used data.",
            "**File a complaint** with the National Privacy Commission."
          ]
        },
        {
          "type": "p",
          "text": "To use any of these rights, contact us using the details in Section 10."
        }
      ]
    },
    {
      "title": "10. Children, Changes and Contact",
      "blocks": [
        {
          "type": "p",
          "text": "**Age requirement.** SaanPaw user accounts are for people 18 years old and above only. We ask for your birthday at registration and do not create an account for anyone under 18. If we learn that an account belongs to someone under 18, we will delete it and its data."
        },
        {
          "type": "p",
          "text": "**Changes to this policy.** We may update this policy as SaanPaw changes. We will post the new version in the app with its effective date and, for major changes, notify you by email or in-app notice."
        },
        {
          "type": "p",
          "text": "**Contact us.** For questions, requests or complaints about your data, contact the SaanPaw Data Protection Officer:"
        },
        {
          "type": "ul",
          "items": [
            "Email: dirk.louisse0715@gmail.com",
            "Address: Spine Road, Altaraza Town Center, Barangay Tungkong Mangga, City of San Jose del Monte, Bulacan"
          ]
        },
        {
          "type": "p",
          "text": "You may also contact the National Privacy Commission at [privacy.gov.ph](https://privacy.gov.ph)."
        }
      ]
    }
  ]
};
