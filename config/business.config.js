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
    intro: `You've spent so long looking after everyone else.
It's easy to forget that you matter too.
If you've been running on empty — you're not alone.
There is so much hope. And this is a good place to start.`,
    about: `I didn't plan any of this. What I planned was a career in healthcare — and for over two decades, that's exactly what I had.

But burnout has a way of asking questions you can't ignore. I found myself searching for something that would help me navigate life with a bit more ease. What I found changed everything.

I came across an understanding about how our minds actually work. It transformed my life in ways I'm still discovering.

Around the same time I started taking reflexology sessions myself — and found them enormously helpful for stress. So a few years later, I trained. Because if something genuinely helps, I want to be able to offer it to others.

None of this happened in a vacuum. I was doing all of it while raising four children, working full time in a very demanding role, and caring for elderly parents. Life was full — in every sense of the word. And this transformation changed how I showed up in all of it. As a parent. As a daughter. As a person.

That desire to help people never went away. It just found a new home.

I work especially with people in healthcare and caring professions. People who are brilliant at giving to others — and have quietly stopped giving to themselves. I know that place. I've been there.

People who work with me start to see life through a different lens. Things feel lighter. Clearer. And quite often — they start to laugh again. You'd be surprised how many people have forgotten how to do that. And how much difference it makes when they remember.`
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
      attribution: 'Coaching Client, Scotland',
      quote:
        'I will be forever grateful. I have a really different outlook on life — and it\'s really helping me most of the time.'
    },
    {
      attribution: 'Coaching Client, Scotland',
      quote:
        'I feel a lot calmer and don\'t always see things as negatives or worries. There are days which are better than others — but I feel happier with myself, which means I\'m not as hard on myself either. And that makes things so much easier!'
    },
    {
      attribution: 'Coaching Client, Northern Ireland',
      quote:
        'Awh Louise, I have a new lens to life. Thanks so much for your support. It will take a while but I will let the new thoughts and perceptions unfold.'
    },
    {
      attribution: 'Coaching Client, Wales',
      quote: 'Thanks Louise for our last call. I am feeling so much calmer inside.'
    },
    {
      attribution: 'Reflexology Client, Donegal',
      quote:
        'I noticed such a difference in my sleep after my sessions with Louise. When I went a while without coming, I really missed it — that said everything about how much it had helped me.'
    }
  ]
};
