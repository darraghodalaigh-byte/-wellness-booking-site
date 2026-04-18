export const BUSINESS_CONFIG = {
  business: {
    name: 'Soul to Sole',
    ownerName: 'Louise O\'Dalaigh',
    ownerEmail: 'hello@soultosole.ie',
    phone: '086-156-8818',
    instagram: '@soultosolebylouise',
    location: 'Ireland',
    timezone: 'Europe/Dublin',
    tagline: 'Reflexology and coaching sessions that bring calm, clarity, and grounded wellbeing.',
    intro:
      'Soul to Sole offers restorative reflexology and clarity coaching in a warm, supportive setting, with thoughtful care tailored to each stage of life.'
  },
  email: {
    senderName: 'Soul to Sole',
    fromEmail: 'bookings@soultosole.ie',
    replyToEmail: 'hello@soultosole.ie',
    ownerEmail: 'hello@soultosole.ie'
  },
  booking: {
    workingDays: [1, 2, 3, 4, 5, 6],
    workingHours: {
      start: '09:00',
      end: '18:00'
    },
    slotIntervalMinutes: 15,
    bufferBetweenAppointmentsMinutes: 15,
    minNoticeHours: 12,
    maxAdvanceBookingDays: 90,
    disabledDates: ['2026-12-25', '2026-12-26', '2027-01-01'],
    blockedTimeRangesByDate: {
      '2026-04-22': ['13:00-15:00'],
      '2026-04-30': ['09:00-11:00']
    }
  },
  services: [
    {
      id: 'reflexology',
      name: 'Reflexology',
      durationMinutes: 60,
      priceGBP: 45,
      shortDescription:
        'A calming foot reflexology session designed to release tension, support circulation, and help your body return to balance.',
      benefits: ['Deep relaxation', 'Stress relief', 'Nervous system support']
    },
    {
      id: 'reflexology-chelation',
      name: 'Reflexology and Chelation',
      durationMinutes: 75,
      priceGBP: 65,
      shortDescription:
        'A combined treatment that pairs reflexology with chelation-focused support to encourage gentle detox and whole-body reset.',
      benefits: ['Restorative treatment blend', 'Supports natural detox pathways', 'Improved overall wellbeing']
    },
    {
      id: 'fertility-reflexology',
      name: 'Fertility Reflexology',
      durationMinutes: 60,
      priceGBP: 60,
      shortDescription:
        'Specialist reflexology support for fertility journeys, helping to calm stress and promote hormonal harmony.',
      benefits: ['Cycle and hormone support', 'Reduced stress and overwhelm', 'Compassionate specialist care']
    },
    {
      id: 'pregnancy-reflexology',
      name: 'Pregnancy Reflexology',
      durationMinutes: 60,
      priceGBP: 60,
      shortDescription:
        'A soothing pregnancy-safe session to ease physical strain, encourage rest, and support emotional calm.',
      benefits: ['Pregnancy-safe relaxation', 'Helps ease tired legs and feet', 'Supports restful sleep']
    },
    {
      id: 'facial-reflexology',
      name: 'Facial and Reflexology',
      durationMinutes: 75,
      priceGBP: 75,
      shortDescription:
        'A luxurious treatment combining facial reflex techniques with traditional reflexology for deep restorative care.',
      benefits: ['Facial and full-body relaxation', 'Skin and stress support', 'Premium therapeutic experience']
    },
    {
      id: 'facial-hand-reflexology',
      name: 'Facial and Hand Reflexology',
      durationMinutes: 60,
      priceGBP: 60,
      shortDescription:
        'A gentle combination treatment focused on facial and hand reflex points to soothe mind and body.',
      benefits: ['Relieves upper-body tension', 'Calms the mind', 'Ideal shorter restorative session']
    },
    {
      id: 'indian-head-massage',
      name: 'Indian Head Massage',
      durationMinutes: 45,
      priceGBP: 40,
      shortDescription:
        'A traditional upper-body massage treatment for scalp, neck, and shoulders to release stress and restore clarity.',
      benefits: ['Eases neck and shoulder tightness', 'Supports headaches and stress reduction', 'Leaves you refreshed and clear']
    },
    {
      id: 'reflexology-programme',
      name: 'Reflexology 6 Session Programme',
      durationMinutes: 60,
      priceGBP: 240,
      shortDescription:
        'A six-session reflexology programme for deeper, consistent support across your wellbeing goals.',
      benefits: ['Excellent long-term value', 'Progressive wellbeing support', 'Structured care plan']
    }
  ],
  policies: {
    cancellation:
      'Please provide at least 24 hours notice to cancel or reschedule. Late cancellations may be charged 50% of the session fee.',
    arrival: 'Please arrive 5 minutes before your session start time so you can settle comfortably.',
    privacy:
      'Your personal details are handled with care and used only to arrange your treatment and communication.'
  },
  faq: [
    {
      question: 'I\'m new to reflexology. Is that okay?',
      answer:
        'Absolutely. Every session begins with a gentle consultation so Louise can tailor treatment to your comfort, goals, and stage of life.'
    },
    {
      question: 'Do you offer package options?',
      answer:
        'Yes. Package prices are available on request, and bespoke clarity coaching packages can be arranged directly with Louise.'
    },
    {
      question: 'Can I reschedule my appointment?',
      answer:
        'Yes. If you need to move your time, contact Soul to Sole as early as possible and an alternative slot will be offered.'
    }
  ],
  testimonials: [
    {
      name: 'Client, Cork',
      role: 'Reflexology Client',
      quote:
        'Louise creates such a calm, caring space. I always leave feeling lighter, clearer, and deeply restored.'
    },
    {
      name: 'Client, Dublin',
      role: 'Fertility Reflexology Client',
      quote:
        'The treatment was both professional and personal. I felt fully supported at every step of my journey.'
    },
    {
      name: 'Client, Limerick',
      role: 'Coaching Client',
      quote:
        'The clarity coaching gave me practical direction and confidence. It felt warm, thoughtful, and genuinely empowering.'
    }
  ]
};
