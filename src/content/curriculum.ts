/**
 * The built-in curriculum (CEFR A1 → C1). Three units per level.
 *
 * Content rules:
 *  - English learning content is always in English.
 *  - `translation` / grammar `ar` fields are Arabic support for the Arabic-first UI.
 *  - `answer` accepts alternatives separated by `|`.
 *  - Exercise ids are stable strings, so re-seeding never orphans attempts or reviews.
 */
import type { Dialogue, DictationSeed, ExerciseSeed, GrammarPoint, Level, UnitSeed, VocabItem } from '../types.js';

type V = [word: string, ipa: string, translation: string, example: string, tags?: string[]];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface UnitInput {
  level: Level;
  order: number;
  title: string;
  theme: string;
  minutes: number;
  grammar: GrammarPoint[];
  vocab: V[];
  dialogue: Dialogue;
  exercises: Omit<ExerciseSeed, 'id'>[];
  dictation: Omit<DictationSeed, 'id'>[];
}

function unit(u: UnitInput): UnitSeed {
  const id = `${u.level.toLowerCase()}-${String(u.order).padStart(2, '0')}`;
  const vocab: VocabItem[] = u.vocab.map(([word, ipa, translation, example, tags]) => ({
    id: `${id}-v-${slug(word)}`,
    word,
    ipa,
    translation,
    example,
    tags: tags ?? [u.theme],
  }));
  return {
    id,
    level: u.level,
    order: u.order,
    title: u.title,
    theme: u.theme,
    minutes: u.minutes,
    grammar: u.grammar,
    vocab,
    dialogue: u.dialogue,
    exercises: u.exercises.map((e, i) => ({ ...e, id: `${id}-e${i + 1}` })),
    dictation: u.dictation.map((d, i) => ({ ...d, id: `${id}-d${i + 1}` })),
  };
}

export const CURRICULUM: UnitSeed[] = [
  // ───────────────────────────── A1 ─────────────────────────────
  unit({
    level: 'A1',
    order: 1,
    title: 'Hello! Nice to meet you',
    theme: 'greetings',
    minutes: 12,
    grammar: [
      {
        name: 'Verb "to be" (am / is / are)',
        rule: 'Use am with I, is with he/she/it, are with you/we/they.',
        ar: 'نستخدم am مع I، و is مع he/she/it، و are مع you/we/they. في العربية لا نحتاج فعلًا هنا («أنا مهندس»)، لكن في الإنجليزية لا بد منه: I am an engineer.',
        examples: ['I am Omar.', 'She is a teacher.', 'We are from Egypt.'],
      },
    ],
    vocab: [
      ['hello', '/həˈləʊ/', 'مرحبًا', 'Hello, my name is Sara.'],
      ['name', '/neɪm/', 'اسم', 'What is your name?'],
      ['meet', '/miːt/', 'يقابل / يتعرّف على', 'Nice to meet you.'],
      ['from', '/frɒm/', 'من (بلد/مكان)', 'I am from Cairo.'],
      ['teacher', '/ˈtiːtʃə/', 'مُعلّم', 'My mother is a teacher.'],
      ['student', '/ˈstjuːdənt/', 'طالب', 'Are you a student?'],
    ],
    dialogue: {
      title: 'First day at a language centre',
      setting: 'You meet a new classmate.',
      turns: [
        {
          bot: "Hi! I'm Lina. What's your name?",
          expect: { keywords: ['name', 'i am|my name'], sample: "Hi Lina, I'm Omar. Nice to meet you." },
        },
        {
          bot: 'Nice to meet you too! Where are you from?',
          expect: { keywords: ['from'], sample: "I'm from Egypt. I live in Cairo." },
        },
        {
          bot: 'Cool! Are you a student?',
          expect: { keywords: ['yes|no', 'student|work|am'], sample: "Yes, I am. I'm a student at Cairo University." },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'She ___ a doctor.',
        options: ['am', 'is', 'are', 'be'],
        answer: 'is',
        explanation: 'He / she / it → is.',
      },
      {
        type: 'gap_fill',
        prompt: 'They ___ from Morocco.',
        answer: 'are',
        explanation: 'We / you / they → are.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['name', 'your', 'is', 'what', '?'],
        answer: 'What is your name?|What is your name',
        explanation: 'Questions with "be": Question word + be + subject.',
      },
      {
        type: 'translate',
        prompt: 'أنا طالب.',
        answer: 'I am a student.|I am a student',
        explanation: 'Do not forget "am" — English always needs the verb "be" here — and the article "a".',
      },
      {
        type: 'dictation',
        prompt: 'Nice to meet you, my name is Ali.',
        answer: 'Nice to meet you, my name is Ali.',
        explanation: 'Listen for the small words: "to", "my", "is".',
      },
      {
        type: 'speaking',
        prompt: 'Introduce yourself: say your name and where you are from.',
        options: ['name|i am', 'from'],
        answer: "Hello, my name is Omar. I'm from Egypt.",
        explanation: 'A complete introduction has a name and a place.',
      },
    ],
    dictation: [
      { sentence: 'My name is Sara and I am a teacher.', hidden: ['name', 'teacher'] },
      { sentence: 'We are students from Egypt.', hidden: ['are', 'from'] },
    ],
  }),

  unit({
    level: 'A1',
    order: 2,
    title: 'My day',
    theme: 'daily routine',
    minutes: 14,
    grammar: [
      {
        name: 'Present simple',
        rule: 'Use the present simple for habits and routines. Add -s/-es with he/she/it.',
        ar: 'المضارع البسيط للعادات والروتين اليومي. مع he/she/it نضيف s أو es للفعل: She works.',
        examples: ['I get up at seven.', 'He works in a bank.', 'She watches TV every evening.'],
      },
      {
        name: "Negatives with don't / doesn't",
        rule: "Use don't with I/you/we/they and doesn't with he/she/it. After doesn't, the verb has no -s.",
        ar: "النفي: don't مع I/you/we/they و doesn't مع he/she/it، وبعد doesn't يأتي الفعل بدون s.",
        examples: ["I don't drink coffee.", "He doesn't work on Fridays."],
      },
    ],
    vocab: [
      ['get up', '/ɡet ʌp/', 'يستيقظ / ينهض من السرير', 'I get up at 7 a.m.'],
      ['breakfast', '/ˈbrekfəst/', 'الفطور', 'I have breakfast at home.'],
      ['usually', '/ˈjuːʒuəli/', 'عادةً', 'I usually take the bus.'],
      ['work', '/wɜːk/', 'يعمل / عمل', 'She works in an office.'],
      ['evening', '/ˈiːvnɪŋ/', 'المساء', 'We watch TV in the evening.'],
      ['never', '/ˈnevə/', 'أبدًا', 'He never drinks coffee.'],
    ],
    dialogue: {
      title: 'Talking about routines',
      setting: 'A friend asks about your normal day.',
      turns: [
        {
          bot: 'What time do you usually get up?',
          expect: { keywords: ['get up|wake up', 'at'], sample: 'I usually get up at seven o’clock.' },
        },
        {
          bot: 'And what do you have for breakfast?',
          expect: { keywords: ['have|eat|drink'], sample: 'I have eggs, bread and tea.' },
        },
        {
          bot: 'What do you do in the evening?',
          expect: { keywords: ['evening|watch|read|study|go'], sample: 'I usually study or watch TV in the evening.' },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'My brother ___ in a hospital.',
        options: ['work', 'works', 'working', 'is work'],
        answer: 'works',
        explanation: 'He / she / it → verb + s: works.',
      },
      {
        type: 'gap_fill',
        prompt: 'She ___ (not / like) coffee.',
        answer: "doesn't like|does not like",
        explanation: "He / she / it → doesn't + base verb (no -s).",
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['usually', 'I', 'the', 'take', 'bus'],
        answer: 'I usually take the bus.|I usually take the bus',
        explanation: 'Frequency adverbs (usually, always, never) go before the main verb.',
      },
      {
        type: 'translate',
        prompt: 'هو يعمل في بنك.',
        answer: 'He works in a bank.|He works at a bank.',
        explanation: 'Remember the -s: he works.',
      },
      {
        type: 'dictation',
        prompt: 'I usually have breakfast at eight.',
        answer: 'I usually have breakfast at eight.',
        explanation: '"Usually" has three syllables: U-su-ally.',
      },
      {
        type: 'speaking',
        prompt: 'Describe your morning routine in two sentences.',
        options: ['get up|wake up', 'breakfast|go|work|study'],
        answer: 'I get up at seven. Then I have breakfast and go to work.',
        explanation: 'Use the present simple and a time expression.',
      },
    ],
    dictation: [
      { sentence: 'He never drinks coffee in the evening.', hidden: ['never', 'evening'] },
      { sentence: 'We go to work by bus.', hidden: ['go', 'bus'] },
    ],
  }),

  unit({
    level: 'A1',
    order: 3,
    title: 'At the market',
    theme: 'food and shopping',
    minutes: 14,
    grammar: [
      {
        name: 'some / any',
        rule: 'Use some in positive sentences and any in questions and negatives.',
        ar: 'نستخدم some في الجمل المثبتة، و any في الأسئلة والنفي: I have some apples / Do you have any milk?',
        examples: ['I need some eggs.', "We don't have any bread.", 'Do you have any water?'],
      },
      {
        name: 'How much / How many',
        rule: 'How many + countable plural (apples). How much + uncountable (water, rice) or price.',
        ar: 'How many مع الأشياء التي تُعدّ (apples)، و How much مع ما لا يُعدّ (rice, water) أو للسؤال عن السعر.',
        examples: ['How many apples do you want?', 'How much rice do we need?', 'How much is this?'],
      },
    ],
    vocab: [
      ['buy', '/baɪ/', 'يشتري', 'I want to buy some bread.'],
      ['price', '/praɪs/', 'سعر', 'What is the price of this bag?'],
      ['cheap', '/tʃiːp/', 'رخيص', 'These oranges are cheap.'],
      ['expensive', '/ɪkˈspensɪv/', 'غالٍ', 'That phone is very expensive.'],
      ['kilo', '/ˈkiːləʊ/', 'كيلو', 'A kilo of tomatoes, please.'],
      ['need', '/niːd/', 'يحتاج', 'We need some milk.'],
    ],
    dialogue: {
      title: 'Buying fruit',
      setting: 'You are at a fruit stall.',
      turns: [
        {
          bot: 'Good morning! What would you like?',
          expect: {
            keywords: ['like|want|need|please', 'kilo|some|apples|oranges|bananas'],
            sample: "I'd like a kilo of apples, please.",
          },
        },
        {
          bot: 'Here you are. Anything else?',
          expect: { keywords: ['yes|no|some|that'], sample: 'Yes, some bananas, please. How much is that?' },
        },
        {
          bot: "That's sixty pounds altogether.",
          expect: { keywords: ['here|thank|thanks'], sample: 'Here you are. Thank you!' },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'How ___ water do you drink every day?',
        options: ['many', 'much', 'any', 'some'],
        answer: 'much',
        explanation: 'Water is uncountable → how much.',
      },
      {
        type: 'gap_fill',
        prompt: "We don't have ___ eggs.",
        answer: 'any',
        explanation: 'Negative sentence → any.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['this', 'how', 'is', 'much', 'bag', '?'],
        answer: 'How much is this bag?|How much is this bag',
        explanation: 'Asking for a price: How much is + thing?',
      },
      {
        type: 'translate',
        prompt: 'أريد كيلو طماطم من فضلك.',
        answer:
          'I want a kilo of tomatoes, please.|I would like a kilo of tomatoes, please.|A kilo of tomatoes, please.',
        explanation: '"A kilo of" + noun. "I would like" is more polite than "I want".',
      },
      {
        type: 'dictation',
        prompt: 'These oranges are cheap but the apples are expensive.',
        answer: 'These oranges are cheap but the apples are expensive.',
        explanation: '"These" is plural (these oranges), "this" is singular.',
      },
      {
        type: 'speaking',
        prompt: 'You are in a shop. Ask for two things and ask the price.',
        options: ['please', 'how much'],
        answer: 'Can I have some bread and a bottle of water, please? How much is that?',
        explanation: 'Use "please" and "How much is that?"',
      },
    ],
    dictation: [
      { sentence: 'Do you have any milk?', hidden: ['any', 'milk'] },
      { sentence: 'How much is a kilo of rice?', hidden: ['much', 'rice'] },
    ],
  }),

  // ───────────────────────────── A2 ─────────────────────────────
  unit({
    level: 'A2',
    order: 1,
    title: 'Last weekend',
    theme: 'past events',
    minutes: 15,
    grammar: [
      {
        name: 'Past simple (regular and irregular)',
        rule: 'Regular verbs add -ed (visited). Irregular verbs change (go → went). Questions and negatives use did + base verb.',
        ar: "الماضي البسيط: الأفعال المنتظمة نضيف لها ed، والشاذة لها صيغة خاصة (go → went). في السؤال والنفي نستخدم did والفعل في صيغته الأصلية: Did you go? / I didn't go.",
        examples: ['I visited my grandmother.', 'We went to the beach.', "She didn't go out."],
      },
    ],
    vocab: [
      ['weekend', '/ˌwiːkˈend/', 'عطلة نهاية الأسبوع', 'What did you do at the weekend?'],
      ['visit', '/ˈvɪzɪt/', 'يزور', 'I visited my cousins.'],
      ['stay', '/steɪ/', 'يبقى / يمكث', 'We stayed at home on Friday.'],
      ['tired', '/taɪəd/', 'متعب', 'I was very tired after the trip.'],
      ['yesterday', '/ˈjestədeɪ/', 'أمس', 'I saw him yesterday.'],
      ['enjoy', '/ɪnˈdʒɔɪ/', 'يستمتع', 'Did you enjoy the film?'],
    ],
    dialogue: {
      title: 'Monday morning chat',
      setting: 'A colleague asks about your weekend.',
      turns: [
        {
          bot: 'Hi! How was your weekend?',
          expect: {
            keywords: ['was|it was', 'good|great|nice|fine|bad|ok|okay|relaxing'],
            sample: 'It was great, thanks!',
          },
        },
        {
          bot: 'What did you do?',
          expect: {
            keywords: ['went|visited|watched|stayed|played|saw|had|met'],
            sample: 'I visited my family and we had lunch together.',
          },
        },
        {
          bot: 'Sounds nice! Did you go out on Saturday night?',
          expect: {
            keywords: ['yes|no', 'did|went|stayed'],
            sample: "No, I didn't. I stayed at home and watched a film.",
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'We ___ to Alexandria last summer.',
        options: ['go', 'goes', 'went', 'gone'],
        answer: 'went',
        explanation: '"Last summer" → past simple. Go is irregular: went.',
      },
      {
        type: 'gap_fill',
        prompt: 'Did you ___ (watch) the match yesterday?',
        answer: 'watch',
        explanation: 'After did, use the base verb (watch, not watched).',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ["didn't", 'I', 'out', 'go', 'yesterday'],
        answer: "I didn't go out yesterday.|I didn't go out yesterday",
        explanation: "Negative past: subject + didn't + base verb.",
      },
      {
        type: 'translate',
        prompt: 'زرت جدتي يوم الجمعة.',
        answer: 'I visited my grandmother on Friday.|I visited my grandma on Friday.',
        explanation: 'Regular verb: visit → visited. Days take "on".',
      },
      {
        type: 'dictation',
        prompt: 'We stayed at home because it was raining.',
        answer: 'We stayed at home because it was raining.',
        explanation: '-ed after a vowel sound is pronounced /d/: stayed.',
      },
      {
        type: 'speaking',
        prompt: 'Tell a friend three things you did last weekend.',
        options: ['went|visited|watched|played|met|stayed', 'and|then'],
        answer: 'On Friday I visited my aunt. Then I watched a film, and on Saturday I played football.',
        explanation: 'Use past simple verbs and linkers like "then" and "and".',
      },
    ],
    dictation: [
      { sentence: 'I was very tired after the long trip.', hidden: ['tired', 'trip'] },
      { sentence: 'Did you enjoy the party last night?', hidden: ['enjoy', 'night'] },
    ],
  }),

  unit({
    level: 'A2',
    order: 2,
    title: 'Plans and predictions',
    theme: 'future',
    minutes: 15,
    grammar: [
      {
        name: 'going to vs will',
        rule: 'Use "going to" for plans you already decided. Use "will" for quick decisions, offers and predictions.',
        ar: "going to للخطط المقررة مسبقًا، و will للقرار اللحظي أو العرض أو التوقع: I'm going to study medicine / I'll help you.",
        examples: [
          "I'm going to visit Aswan next month.",
          "It's cold — I'll close the window.",
          'I think it will rain tomorrow.',
        ],
      },
    ],
    vocab: [
      ['plan', '/plæn/', 'خطة / يخطط', 'What are your plans for the summer?'],
      ['probably', '/ˈprɒbəbli/', 'على الأرجح', "I'll probably stay at home."],
      ['holiday', '/ˈhɒlədeɪ/', 'إجازة', 'We are going to Dahab for our holiday.'],
      ['book', '/bʊk/', 'يحجز', 'I booked a hotel online.'],
      ['next', '/nekst/', 'القادم', "I'm going to start a course next week."],
      ['decide', '/dɪˈsaɪd/', 'يقرر', "I haven't decided yet."],
    ],
    dialogue: {
      title: 'Summer plans',
      setting: 'A friend asks about your plans.',
      turns: [
        {
          bot: 'Have you got any plans for the summer?',
          expect: { keywords: ['going to|will|plan'], sample: "Yes, I'm going to travel to Dahab with my friends." },
        },
        {
          bot: 'Nice! How are you going to get there?',
          expect: { keywords: ['going to|will|by|take'], sample: "We're going to take the bus. It's cheaper." },
        },
        {
          bot: "I'd love to come but I haven't got a ticket.",
          expect: { keywords: ["will|i'll|help|book"], sample: "Don't worry, I'll book one for you tonight." },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'The phone is ringing. — OK, I ___ answer it.',
        options: ["'ll", "'m going to", 'am', 'going'],
        answer: "'ll",
        explanation: 'A quick decision at the moment of speaking → will.',
      },
      {
        type: 'gap_fill',
        prompt: "Look at those dark clouds! It's ___ to rain.",
        answer: 'going',
        explanation: 'A prediction from present evidence → going to.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['going', 'are', 'what', 'you', 'to', 'do', '?'],
        answer: 'What are you going to do?|What are you going to do',
        explanation: 'Question: What + be + subject + going to + verb?',
      },
      {
        type: 'translate',
        prompt: 'سأساعدك في حقيبتك.',
        answer: "I'll help you with your bag.|I will help you with your bag.|I'll help you with your suitcase.",
        explanation: 'An offer → will. "Help someone with something".',
      },
      {
        type: 'dictation',
        prompt: "I'm going to start a new course next week.",
        answer: "I'm going to start a new course next week.",
        explanation: 'In fast speech "going to" sounds like "gonna" — write "going to".',
      },
      {
        type: 'speaking',
        prompt: 'Say what you are going to do this weekend and make one prediction.',
        options: ['going to', 'will|think'],
        answer: "This weekend I'm going to visit my parents. I think it will be sunny.",
        explanation: 'going to (plan) + will (prediction).',
      },
    ],
    dictation: [
      { sentence: "I'll probably stay at home this evening.", hidden: ['probably', 'evening'] },
      { sentence: 'We booked a hotel for our holiday.', hidden: ['booked', 'holiday'] },
    ],
  }),

  unit({
    level: 'A2',
    order: 3,
    title: 'Finding your way',
    theme: 'directions',
    minutes: 14,
    grammar: [
      {
        name: 'Prepositions of place',
        rule: 'next to, opposite, between, behind, in front of, on the corner of.',
        ar: 'حروف الجر للمكان: next to (بجانب)، opposite (أمام/مقابل)، between (بين)، behind (خلف)، in front of (أمام).',
        examples: ['The bank is next to the pharmacy.', 'The café is opposite the station.'],
      },
      {
        name: 'Imperatives for directions',
        rule: 'Use the base verb with no subject: Go straight, turn left, take the second right.',
        ar: 'صيغة الأمر: الفعل في صيغته الأصلية بدون فاعل: Turn left / Go straight on.',
        examples: ['Go straight on.', 'Turn right at the traffic lights.', 'Take the first left.'],
      },
    ],
    vocab: [
      ['straight on', '/streɪt ɒn/', 'على طول / إلى الأمام مباشرة', 'Go straight on for 200 metres.'],
      ['turn', '/tɜːn/', 'ينعطف', 'Turn left at the mosque.'],
      ['opposite', '/ˈɒpəzɪt/', 'مقابل', 'The pharmacy is opposite the school.'],
      ['corner', '/ˈkɔːnə/', 'ناصية / زاوية', 'The bakery is on the corner.'],
      ['traffic lights', '/ˈtræfɪk laɪts/', 'إشارة المرور', 'Stop at the traffic lights.'],
      ['far', '/fɑː/', 'بعيد', 'Is the station far from here?'],
    ],
    dialogue: {
      title: 'Lost in the city',
      setting: 'A tourist stops you in the street.',
      turns: [
        {
          bot: 'Excuse me, is there a pharmacy near here?',
          expect: { keywords: ["yes|there is|there's"], sample: "Yes, there's one on Tahrir Street." },
        },
        {
          bot: 'How do I get there?',
          expect: {
            keywords: ['go|turn|take', 'left|right|straight'],
            sample: 'Go straight on and turn left at the traffic lights.',
          },
        },
        {
          bot: 'Is it far?',
          expect: { keywords: ['no|not|minutes|yes'], sample: "No, it's not far. It's about five minutes on foot." },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'The bank is ___ the post office and the café.',
        options: ['between', 'opposite', 'next', 'behind of'],
        answer: 'between',
        explanation: 'between A and B.',
      },
      {
        type: 'gap_fill',
        prompt: '___ left at the traffic lights.',
        answer: 'Turn',
        explanation: 'Directions use the imperative: Turn left.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['the', 'is', 'where', 'station', 'nearest', '?'],
        answer: 'Where is the nearest station?|Where is the nearest station',
        explanation: 'Where + is + the + superlative + noun?',
      },
      {
        type: 'translate',
        prompt: 'الصيدلية مقابل المدرسة.',
        answer: 'The pharmacy is opposite the school.|The pharmacy is across from the school.',
        explanation: '"Opposite" needs no "of" (not "opposite of the school").',
      },
      {
        type: 'dictation',
        prompt: 'Take the second right and the bakery is on the corner.',
        answer: 'Take the second right and the bakery is on the corner.',
        explanation: '"On the corner" — use "on".',
      },
      {
        type: 'speaking',
        prompt: 'Give directions from your home to the nearest shop.',
        options: ['go|walk', 'turn|left|right|straight'],
        answer: 'Go out of the building, turn right and walk straight on. The shop is next to the bank.',
        explanation: 'Imperatives + prepositions of place.',
      },
    ],
    dictation: [
      { sentence: 'Is the station far from here?', hidden: ['station', 'far'] },
      { sentence: 'Go straight on and turn left at the mosque.', hidden: ['straight', 'left'] },
    ],
  }),

  // ───────────────────────────── B1 ─────────────────────────────
  unit({
    level: 'B1',
    order: 1,
    title: 'Have you ever…?',
    theme: 'experiences',
    minutes: 16,
    grammar: [
      {
        name: 'Present perfect vs past simple',
        rule: 'Present perfect (have + past participle) = life experience, time not stated. Past simple = finished time (yesterday, in 2019).',
        ar: 'المضارع التام (have + التصريف الثالث) للتجارب دون ذكر وقت محدد. أما إذا ذكرنا وقتًا منتهيًا (yesterday, in 2019) فنستخدم الماضي البسيط. خطأ شائع: I have visited Paris last year ✗',
        examples: ['I have been to Jordan twice.', 'I went to Jordan in 2021.', 'Have you ever eaten sushi?'],
      },
      {
        name: 'for / since',
        rule: 'for + a period (for three years); since + a starting point (since 2020).',
        ar: 'for مع المدة (for three years)، و since مع نقطة البداية (since 2020). لا تقل since three years ✗',
        examples: ["I've lived here for five years.", "She's worked here since March."],
      },
    ],
    vocab: [
      ['experience', '/ɪkˈspɪəriəns/', 'تجربة / خبرة', 'It was an amazing experience.'],
      ['ever', '/ˈevə/', 'من قبل (في السؤال)', 'Have you ever flown?'],
      ['abroad', '/əˈbrɔːd/', 'في الخارج', "I've never lived abroad."],
      ['already', '/ɔːlˈredi/', 'بالفعل / سابقًا', "I've already seen that film."],
      ['yet', '/jet/', 'بعد (في النفي والسؤال)', 'Have you finished yet?'],
      ['recently', '/ˈriːsntli/', 'مؤخرًا', "I've recently started a new job."],
    ],
    dialogue: {
      title: 'Travel experiences',
      setting: 'Chatting with a new friend about travel.',
      turns: [
        {
          bot: 'Have you ever been abroad?',
          expect: {
            keywords: ["have|haven't|never", 'been|travelled|visited'],
            sample: "Yes, I have. I've been to Saudi Arabia and Turkey.",
          },
        },
        {
          bot: 'When did you go to Turkey?',
          expect: { keywords: ['went|was', 'in|last|ago'], sample: 'I went there two years ago, in 2023.' },
        },
        {
          bot: 'How long have you studied English?',
          expect: {
            keywords: ['for|since', "have|i've|studied|been"],
            sample: "I've studied English since I was ten — for about twelve years.",
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'I ___ my keys. I can’t find them anywhere.',
        options: ['lost', 'have lost', 'had lose', 'am losing'],
        answer: 'have lost',
        explanation: 'Past action with a result now → present perfect.',
      },
      {
        type: 'gap_fill',
        prompt: "I've lived in Giza ___ 2018.",
        answer: 'since',
        explanation: '2018 is a starting point → since.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['ever', 'you', 'have', 'eaten', 'sushi', '?'],
        answer: 'Have you ever eaten sushi?|Have you ever eaten sushi',
        explanation: 'Have + subject + ever + past participle?',
      },
      {
        type: 'translate',
        prompt: 'أعمل هنا منذ ثلاث سنوات.',
        answer:
          "I've worked here for three years.|I have worked here for three years.|I've been working here for three years.|I have been working here for three years.",
        explanation:
          'Arabic uses the present ("أعمل") but English needs the present perfect + for: I have worked here for three years.',
      },
      {
        type: 'dictation',
        prompt: "I've already seen that film, but I haven't read the book yet.",
        answer: "I've already seen that film, but I haven't read the book yet.",
        explanation: '"already" in positive sentences, "yet" at the end of negatives and questions.',
      },
      {
        type: 'speaking',
        prompt: 'Talk about one interesting experience you have had. Say when it happened.',
        options: ["have|i've", 'went|was|did|ago|in'],
        answer: "I've climbed Mount Sinai. I went there with friends in 2022 and we watched the sunrise.",
        explanation: 'Introduce with present perfect, give details with past simple.',
      },
    ],
    dictation: [
      { sentence: 'Have you ever lived abroad?', hidden: ['ever', 'abroad'] },
      { sentence: "She's recently started a new job in Dubai.", hidden: ['recently', 'started'] },
    ],
  }),

  unit({
    level: 'B1',
    order: 2,
    title: 'At work',
    theme: 'work',
    minutes: 16,
    grammar: [
      {
        name: 'Obligation and advice: must / have to / should',
        rule: "have to = an external rule; must = strong personal obligation or written rules; should = advice. don't have to = not necessary; mustn't = not allowed.",
        ar: "have to للالتزام الخارجي، و must للالتزام القوي أو القوانين المكتوبة، و should للنصيحة. انتبه: don't have to = غير ضروري، أما mustn't = ممنوع.",
        examples: [
          'I have to wear a uniform.',
          'You mustn’t smoke here.',
          "You don't have to come — it's optional.",
          'You should update your CV.',
        ],
      },
    ],
    vocab: [
      ['deadline', '/ˈdedlaɪn/', 'الموعد النهائي', 'The deadline is next Thursday.'],
      ['colleague', '/ˈkɒliːɡ/', 'زميل عمل', 'My colleagues are very helpful.'],
      ['salary', '/ˈsæləri/', 'راتب', 'The salary is good but the hours are long.'],
      ['apply for', '/əˈplaɪ fɔː/', 'يتقدّم لـ (وظيفة)', "I'm going to apply for that job."],
      ['experience', '/ɪkˈspɪəriəns/', 'خبرة', 'Do you have any experience in sales?', ['work']],
      ['responsible for', '/rɪˈspɒnsəbl fɔː/', 'مسؤول عن', "I'm responsible for the company's social media."],
    ],
    dialogue: {
      title: 'A job interview',
      setting: 'You are being interviewed for a job.',
      turns: [
        {
          bot: 'Tell me about your current job.',
          expect: {
            keywords: ["work|i'm|responsible"],
            sample: "I work as a sales assistant. I'm responsible for customer service.",
          },
        },
        {
          bot: 'Why do you want to work here?',
          expect: {
            keywords: ['because|want|would like|interested'],
            sample: "Because I'd like to develop my skills and your company has a great reputation.",
          },
        },
        {
          bot: 'In this job you have to work some Saturdays. Is that OK?',
          expect: {
            keywords: ['yes|no|fine|ok|okay|problem'],
            sample: "Yes, that's fine. I don't mind working on Saturdays.",
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'You ___ pay — the museum is free on Fridays.',
        options: ["mustn't", "don't have to", "shouldn't to", "haven't"],
        answer: "don't have to",
        explanation: "Not necessary → don't have to. Mustn't would mean it is forbidden.",
      },
      {
        type: 'gap_fill',
        prompt: 'You look tired. You ___ go to bed early.',
        answer: 'should',
        explanation: 'Advice → should.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['for', 'job', 'applied', 'I', 'that', 'have'],
        answer: 'I have applied for that job.|I have applied for that job',
        explanation: '"apply for" a job.',
      },
      {
        type: 'translate',
        prompt: 'يجب أن أنهي هذا التقرير قبل الموعد النهائي.',
        answer:
          'I have to finish this report before the deadline.|I must finish this report before the deadline.|I need to finish this report before the deadline.',
        explanation: 'Obligation → have to / must + base verb.',
      },
      {
        type: 'dictation',
        prompt: 'My colleagues are helpful, but the deadlines are really tight.',
        answer: 'My colleagues are helpful, but the deadlines are really tight.',
        explanation: '"colleague" is pronounced KOL-eeg.',
      },
      {
        type: 'speaking',
        prompt: 'Describe your job or studies: what you have to do and what you are responsible for.',
        options: ['have to|must', 'responsible|work|study'],
        answer:
          "I'm a student. I have to attend lectures every day and I'm responsible for organising our study group.",
        explanation: 'Use have to + responsible for.',
      },
    ],
    dictation: [
      { sentence: 'You must not use your phone during the meeting.', hidden: ['must', 'meeting'] },
      { sentence: "I'm responsible for training new staff.", hidden: ['responsible', 'training'] },
    ],
  }),

  unit({
    level: 'B1',
    order: 3,
    title: 'Healthy living',
    theme: 'health',
    minutes: 16,
    grammar: [
      {
        name: 'First conditional',
        rule: 'If + present simple, will + verb — for real, possible future situations.',
        ar: 'الشرط الأول: If + مضارع بسيط، will + فعل — لموقف محتمل في المستقبل. لا نضع will بعد if: If it will rain ✗',
        examples: ["If you exercise every day, you'll feel better.", "If it rains, we won't go."],
      },
      {
        name: 'Second conditional',
        rule: 'If + past simple, would + verb — for unreal or unlikely situations now.',
        ar: 'الشرط الثاني: If + ماضٍ بسيط، would + فعل — لموقف خيالي أو غير مرجّح. مع I/he/she يُفضّل were: If I were you…',
        examples: ['If I had more time, I would go to the gym.', 'If I were you, I would see a doctor.'],
      },
    ],
    vocab: [
      ['healthy', '/ˈhelθi/', 'صحي', 'I try to eat healthy food.'],
      ['exercise', '/ˈeksəsaɪz/', 'تمرين / يمارس الرياضة', 'Regular exercise is good for your heart.'],
      ['headache', '/ˈhedeɪk/', 'صداع', "I've got a terrible headache."],
      ['avoid', '/əˈvɔɪd/', 'يتجنّب', 'You should avoid sugary drinks.'],
      ['habit', '/ˈhæbɪt/', 'عادة', 'Smoking is a bad habit.'],
      ['advice', '/ədˈvaɪs/', 'نصيحة', 'Can I give you some advice?'],
    ],
    dialogue: {
      title: 'At the doctor’s',
      setting: 'You visit a doctor because you feel unwell.',
      turns: [
        {
          bot: "Good morning. What's the problem?",
          expect: {
            keywords: ['have|got|feel|hurts', 'headache|pain|tired|sick|ill|cough|fever'],
            sample: "I've had a bad headache for three days.",
          },
        },
        {
          bot: 'Do you sleep well and drink enough water?',
          expect: {
            keywords: ['yes|no|not|sleep|drink'],
            sample: 'Not really. I only sleep about five hours and I drink a lot of coffee.',
          },
        },
        {
          bot: 'If you sleep more and drink water, you will feel better. Any questions?',
          expect: { keywords: ['should|can|will|if|thank'], sample: 'Should I take any medicine? Thank you, doctor.' },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'If I ___ rich, I would travel around the world.',
        options: ['am', 'were', 'will be', 'would be'],
        answer: 'were',
        explanation: 'Unreal present → second conditional: if + past simple (were/was).',
      },
      {
        type: 'gap_fill',
        prompt: "If you don't drink water, you ___ get a headache.",
        answer: 'will|will probably|might',
        explanation: 'First conditional → will + verb in the main clause.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['I', 'you', 'were', 'if', 'see', 'a', 'doctor', 'would', 'I'],
        answer: 'If I were you I would see a doctor.|If I were you, I would see a doctor.',
        explanation: '"If I were you" is the standard way to give advice.',
      },
      {
        type: 'translate',
        prompt: 'لو كان عندي وقت أكثر لمارست الرياضة كل يوم.',
        answer:
          'If I had more time, I would exercise every day.|If I had more time, I would do exercise every day.|If I had more time, I would work out every day.',
        explanation: 'Imaginary situation → second conditional.',
      },
      {
        type: 'dictation',
        prompt: "If you avoid sugar, you'll have more energy.",
        answer: "If you avoid sugar, you'll have more energy.",
        explanation: '"you\'ll" = you will.',
      },
      {
        type: 'speaking',
        prompt: 'Give a friend advice about a healthy habit using "If…".',
        options: ['if', 'will|would|should'],
        answer:
          "If you walk for thirty minutes a day, you'll sleep better. If I were you, I would stop drinking energy drinks.",
        explanation: 'Combine a first and a second conditional.',
      },
    ],
    dictation: [
      { sentence: "I've got a terrible headache today.", hidden: ['terrible', 'headache'] },
      { sentence: 'Regular exercise is a very healthy habit.', hidden: ['exercise', 'habit'] },
    ],
  }),

  // ───────────────────────────── B2 ─────────────────────────────
  unit({
    level: 'B2',
    order: 1,
    title: 'Technology and us',
    theme: 'technology',
    minutes: 18,
    grammar: [
      {
        name: 'The passive voice',
        rule: 'be + past participle. Use it when the action matters more than who did it. Add "by" only if the agent is important.',
        ar: 'المبني للمجهول: be + التصريف الثالث. نستخدمه حين يكون الحدث أهم من الفاعل: The app was downloaded by millions.',
        examples: [
          'Millions of messages are sent every minute.',
          'The app was developed in Cairo.',
          'New features will be added next year.',
        ],
      },
    ],
    vocab: [
      ['device', '/dɪˈvaɪs/', 'جهاز', 'How many devices do you own?'],
      ['update', '/ʌpˈdeɪt/', 'تحديث / يحدّث', 'The software is updated automatically.'],
      ['privacy', '/ˈprɪvəsi/', 'الخصوصية', 'Many users worry about their privacy.'],
      ['rely on', '/rɪˈlaɪ ɒn/', 'يعتمد على', 'We rely on our phones for everything.'],
      ['addictive', '/əˈdɪktɪv/', 'يسبب الإدمان', 'Social media can be addictive.'],
      ['breakthrough', '/ˈbreɪkθruː/', 'إنجاز / اختراق علمي', 'It was a major breakthrough in medicine.'],
    ],
    dialogue: {
      title: 'Screen time',
      setting: 'A podcast host interviews you about technology.',
      turns: [
        {
          bot: 'How much do you rely on your smartphone?',
          expect: {
            keywords: ['rely|depend|use'],
            sample: 'Honestly, I rely on it for almost everything — work, banking and news.',
          },
        },
        {
          bot: 'Do you worry about privacy online?',
          expect: {
            keywords: ['privacy|data|worry|concerned|is|are'],
            sample: 'Yes, I do. A lot of personal data is collected without people realising it.',
          },
        },
        {
          bot: 'What do you think will be invented in the next ten years?',
          expect: {
            keywords: ['will|think|be'],
            sample: 'I think cars will be driven entirely by AI, and many diseases will be cured.',
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'The first iPhone ___ in 2007.',
        options: ['released', 'was released', 'has released', 'is releasing'],
        answer: 'was released',
        explanation: 'Past passive: was/were + past participle.',
      },
      {
        type: 'gap_fill',
        prompt: 'Your password must ___ changed every three months.',
        answer: 'be',
        explanation: 'Modal passive: must + be + past participle.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['are', 'every', 'sent', 'millions', 'of', 'emails', 'day'],
        answer: 'Millions of emails are sent every day.|Millions of emails are sent every day',
        explanation: 'Present passive: am/is/are + past participle.',
      },
      {
        type: 'translate',
        prompt: 'تم تطوير هذا التطبيق في مصر.',
        answer: 'This app was developed in Egypt.|This application was developed in Egypt.',
        explanation: '"تم + مصدر" usually = English passive.',
      },
      {
        type: 'dictation',
        prompt: 'A lot of personal data is collected without our permission.',
        answer: 'A lot of personal data is collected without our permission.',
        explanation: '"data" is usually treated as uncountable: data is.',
      },
      {
        type: 'speaking',
        prompt: 'Describe how a popular app or device is used in your country. Use at least two passives.',
        options: ['is|are|was', 'used|made|sent|developed|downloaded'],
        answer:
          'WhatsApp is used by almost everyone in Egypt. Voice notes are sent instead of calls, and groups are created for every family.',
        explanation: 'Present passive describes general facts.',
      },
    ],
    dictation: [
      { sentence: 'Social media can be highly addictive.', hidden: ['addictive', 'highly'] },
      { sentence: 'The software is updated automatically every night.', hidden: ['updated', 'automatically'] },
    ],
  }),

  unit({
    level: 'B2',
    order: 2,
    title: 'Making your case',
    theme: 'opinions',
    minutes: 18,
    grammar: [
      {
        name: 'Contrast linkers: although / however / whereas / despite',
        rule: 'although + clause; despite + noun/-ing; however starts a new sentence (followed by a comma); whereas compares two facts.',
        ar: 'although + جملة كاملة، despite + اسم أو فعل ing، However في بداية جملة جديدة وبعدها فاصلة، whereas للمقارنة بين حقيقتين. خطأ شائع: Although…, but… ✗ (لا نجمع although و but).',
        examples: [
          'Although it was expensive, we bought it.',
          'Despite the rain, the match continued.',
          'The city is noisy. However, it is exciting.',
        ],
      },
    ],
    vocab: [
      ['argue', '/ˈɑːɡjuː/', 'يجادل / يحتج بأن', 'Some people argue that homework is useless.'],
      ['point of view', '/pɔɪnt əv vjuː/', 'وجهة نظر', 'I understand your point of view.'],
      ['convincing', '/kənˈvɪnsɪŋ/', 'مقنع', "That's not a very convincing argument."],
      ['drawback', '/ˈdrɔːbæk/', 'عيب / سلبية', 'The main drawback is the cost.'],
      ['on the other hand', '/ɒn ði ˈʌðə hænd/', 'من ناحية أخرى', 'On the other hand, it saves time.'],
      ['agree with', '/əˈɡriː wɪð/', 'يتفق مع', 'I completely agree with you.'],
    ],
    dialogue: {
      title: 'Remote work debate',
      setting: 'A colleague challenges your opinion in a meeting.',
      turns: [
        {
          bot: 'I think everyone should go back to the office full-time. What do you think?',
          expect: {
            keywords: ['think|believe|opinion|agree|disagree', 'because|although|however'],
            sample:
              'I see your point. However, I believe a hybrid model is more productive because people save time on commuting.',
          },
        },
        {
          bot: "But isn't teamwork harder when people work from home?",
          expect: {
            keywords: ['although|despite|however|whereas|but'],
            sample: 'Although it can be harder, online tools make collaboration much easier than before.',
          },
        },
        {
          bot: "So what's the biggest drawback of remote work, in your view?",
          expect: {
            keywords: ['drawback|disadvantage|problem|issue', 'is'],
            sample: 'The main drawback is that some people feel isolated.',
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: '___ being tired, she finished the report.',
        options: ['Although', 'Despite', 'However', 'Whereas'],
        answer: 'Despite',
        explanation: 'despite + -ing / noun. "Although" needs a full clause (although she was tired).',
      },
      {
        type: 'gap_fill',
        prompt: 'My brother loves football, ___ I prefer tennis.',
        answer: 'whereas|while|but',
        explanation: 'Comparing two contrasting facts → whereas.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['was', 'although', 'it', 'expensive', 'we', 'it', 'bought'],
        answer:
          'Although it was expensive, we bought it.|Although it was expensive we bought it.|We bought it although it was expensive.',
        explanation: 'although + subject + verb.',
      },
      {
        type: 'translate',
        prompt: 'على الرغم من أن الفكرة جيدة، إلا أنها مكلفة جدًا.',
        answer:
          'Although the idea is good, it is very expensive.|Although the idea is good, it is too expensive.|Although it is a good idea, it is very expensive.',
        explanation: 'Arabic says "على الرغم من… إلا أن", but English uses only "although" — never "although… but".',
      },
      {
        type: 'dictation',
        prompt: "I see your point of view. However, I'm not completely convinced.",
        answer: "I see your point of view. However, I'm not completely convinced.",
        explanation: '"However" starts a sentence and is followed by a comma.',
      },
      {
        type: 'speaking',
        prompt: 'Give your opinion on "Should university be free?" with one reason and one counter-argument.',
        options: ['think|believe|opinion', 'because|since', 'however|although|on the other hand'],
        answer:
          'I believe university should be free because education benefits the whole society. On the other hand, it would be very costly for the government.',
        explanation: 'Opinion + reason + contrast = a balanced argument.',
      },
    ],
    dictation: [
      { sentence: 'The main drawback is the high cost.', hidden: ['drawback', 'cost'] },
      { sentence: 'Despite the traffic, we arrived on time.', hidden: ['Despite', 'traffic'] },
    ],
  }),

  unit({
    level: 'B2',
    order: 3,
    title: 'In the news',
    theme: 'media',
    minutes: 18,
    grammar: [
      {
        name: 'Reported speech',
        rule: 'When reporting, move tenses one step back: is → was, will → would, have done → had done. Change pronouns and time words (today → that day).',
        ar: 'الكلام المنقول: نرجع الزمن خطوة للوراء (is → was، will → would)، ونغيّر الضمائر وكلمات الزمن (tomorrow → the next day). مع say لا نذكر المفعول، ومع tell يجب ذكره: He told me / He said (that).',
        examples: [
          '"I am tired." → She said (that) she was tired.',
          '"We will win." → He said they would win.',
          '"Have you finished?" → She asked if I had finished.',
        ],
      },
    ],
    vocab: [
      ['headline', '/ˈhedlaɪn/', 'عنوان رئيسي (خبر)', 'Did you see the headlines this morning?'],
      ['claim', '/kleɪm/', 'يزعم / ادّعاء', 'The company claims the product is safe.'],
      ['source', '/sɔːs/', 'مصدر', 'Always check your sources.'],
      ['reliable', '/rɪˈlaɪəbl/', 'موثوق', 'Is this website a reliable source?'],
      ['announce', '/əˈnaʊns/', 'يُعلن', 'The minister announced new measures.'],
      ['fake news', '/feɪk njuːz/', 'أخبار كاذبة', 'Fake news spreads quickly online.'],
    ],
    dialogue: {
      title: 'Did you hear?',
      setting: 'A friend shares some news they read online.',
      turns: [
        {
          bot: 'Did you hear? A website says that schools will close for a month!',
          expect: {
            keywords: ['really|where|source|reliable|sure|true'],
            sample: 'Really? Which website? Is it a reliable source?',
          },
        },
        {
          bot: 'My cousin told me it was on the news. What did the minister actually say?',
          expect: {
            keywords: ['said|announced|told', 'would|was|were'],
            sample: 'Actually, the minister said that schools would stay open, but exams would be postponed.',
          },
        },
        {
          bot: 'Oh! So how do you avoid fake news?',
          expect: {
            keywords: ['check|source|compare|official'],
            sample: 'I always check official sources and compare a few news sites before I share anything.',
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: '"I will call you tomorrow." → He said he ___ me the next day.',
        options: ['will call', 'would call', 'calls', 'called'],
        answer: 'would call',
        explanation: 'will → would in reported speech.',
      },
      {
        type: 'gap_fill',
        prompt: 'She ___ me that she was leaving.',
        answer: 'told',
        explanation: 'tell + person (told me); say + no person (she said that…).',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['asked', 'me', 'if', 'had', 'I', 'she', 'finished'],
        answer: 'She asked me if I had finished.|She asked me if I had finished',
        explanation: 'Reported questions use statement word order (if + subject + verb).',
      },
      {
        type: 'translate',
        prompt: 'قال المدير إن الاجتماع سيُعقد يوم الأحد.',
        answer:
          'The manager said that the meeting would be held on Sunday.|The manager said the meeting would be held on Sunday.|The manager said that the meeting would take place on Sunday.',
        explanation: 'Reported future → would; passive "be held".',
      },
      {
        type: 'dictation',
        prompt: 'The company claims that the product is completely safe.',
        answer: 'The company claims that the product is completely safe.',
        explanation: 'Present reporting verb (claims) → no tense change needed.',
      },
      {
        type: 'speaking',
        prompt: 'Report a piece of news you heard recently: who said it and what they said.',
        options: ['said|told|announced|reported', 'that|would|was|were|had'],
        answer:
          'The weather forecast said that it would be very hot this weekend, and the ministry announced that people should stay indoors at midday.',
        explanation: 'Reporting verb + backshifted tense.',
      },
    ],
    dictation: [
      { sentence: 'Always check whether your source is reliable.', hidden: ['source', 'reliable'] },
      { sentence: 'The minister announced the news this morning.', hidden: ['announced', 'minister'] },
    ],
  }),

  // ───────────────────────────── C1 ─────────────────────────────
  unit({
    level: 'C1',
    order: 1,
    title: 'Professional communication',
    theme: 'formal register',
    minutes: 20,
    grammar: [
      {
        name: 'Hedging and softening',
        rule: 'Soften claims and requests with modals (might, could), tentative verbs (seem, appear, tend to) and phrases (it would appear that, I was wondering if).',
        ar: 'التلطيف (Hedging): في الكتابة المهنية نخفف الأحكام والطلبات بأفعال مثل might/could و seem/appear وعبارات مثل I was wondering if… بدل الأوامر المباشرة.',
        examples: [
          'It would appear that there has been a misunderstanding.',
          'I was wondering if you could send me the figures.',
          'The results seem to suggest a slight improvement.',
        ],
      },
    ],
    vocab: [
      ['regarding', '/rɪˈɡɑːdɪŋ/', 'بخصوص', 'I am writing regarding your recent enquiry.'],
      ['clarify', '/ˈklærəfaɪ/', 'يوضّح', 'Could you clarify the next steps?'],
      ['postpone', '/pəˈspəʊn/', 'يؤجّل', 'We have had to postpone the launch.'],
      ['feasible', '/ˈfiːzəbl/', 'ممكن / قابل للتنفيذ', 'Is this timeline feasible?'],
      ['outline', '/ˈaʊtlaɪn/', 'يوجز / يحدّد الخطوط العريضة', 'Let me briefly outline the proposal.'],
      ['follow up', '/ˈfɒləʊ ʌp/', 'يتابع', "I'm following up on my previous email."],
    ],
    dialogue: {
      title: 'A delicate client call',
      setting: 'An important client is unhappy about a delay.',
      turns: [
        {
          bot: "Frankly, we're disappointed. The project was supposed to be delivered last week.",
          expect: {
            keywords: ['apologise|apologize|sorry|understand', 'delay|delivered|project'],
            sample: 'I completely understand your frustration, and I apologise for the delay.',
          },
        },
        {
          bot: 'So what exactly happened?',
          expect: {
            keywords: ['seem|appear|would|might|unfortunately|due'],
            sample:
              'It would appear that one of our suppliers was unable to meet their deadline, which unfortunately had a knock-on effect.',
          },
        },
        {
          bot: 'And when can we realistically expect it?',
          expect: {
            keywords: ['could|would|propose|suggest|by'],
            sample: 'We could deliver a first version by Thursday, if that would be feasible on your side.',
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'Choose the most appropriate opening for a formal email.',
        options: [
          'Hey, what’s up with the report?',
          'I am writing regarding the report you mentioned.',
          'Send me the report now.',
          'Report pls.',
        ],
        answer: 'I am writing regarding the report you mentioned.',
        explanation: '"I am writing regarding…" is a standard formal opener.',
      },
      {
        type: 'gap_fill',
        prompt: 'I was ___ if you could send me the latest figures.',
        answer: 'wondering',
        explanation: '"I was wondering if you could…" is a very polite request.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['would', 'it', 'appear', 'that', 'a', 'there', 'has', 'been', 'misunderstanding'],
        answer:
          'It would appear that there has been a misunderstanding.|It would appear that there has been a misunderstanding',
        explanation: 'Distancing phrase: "It would appear that…" softens a criticism.',
      },
      {
        type: 'translate',
        prompt: 'هل يمكنك توضيح الخطوات التالية من فضلك؟',
        answer:
          'Could you please clarify the next steps?|Could you clarify the next steps, please?|Would you mind clarifying the next steps?',
        explanation: 'Could you… / Would you mind + -ing are polite request forms.',
      },
      {
        type: 'dictation',
        prompt: "I'm following up on my previous email regarding the revised timeline.",
        answer: "I'm following up on my previous email regarding the revised timeline.",
        explanation: '"follow up on" something.',
      },
      {
        type: 'speaking',
        prompt: 'Politely tell your manager that a deadline is not realistic and suggest an alternative.',
        options: ['might|could|would|seem|appear|afraid', 'suggest|propose|alternative|instead|feasible'],
        answer:
          "I'm afraid the current deadline might not be feasible given the scope. Would it be possible to deliver the core features first and the rest a week later?",
        explanation: 'Hedge the problem, then propose a concrete alternative.',
      },
    ],
    dictation: [
      { sentence: 'Is this timeline feasible for your team?', hidden: ['timeline', 'feasible'] },
      { sentence: 'We have had to postpone the launch until March.', hidden: ['postpone', 'launch'] },
    ],
  }),

  unit({
    level: 'C1',
    order: 2,
    title: 'Ideas with impact',
    theme: 'emphasis',
    minutes: 20,
    grammar: [
      {
        name: 'Inversion for emphasis',
        rule: 'After negative or limiting adverbials at the start of a sentence (Never, Rarely, Not only, Only when, Under no circumstances), invert subject and auxiliary.',
        ar: 'القلب للتوكيد: عندما تبدأ الجملة بظرف نفي أو تقييد (Never, Rarely, Not only, Under no circumstances) نقدّم الفعل المساعد على الفاعل كما في السؤال: Never have I seen…',
        examples: [
          'Never have I seen such a beautiful sunset.',
          'Not only did she win, but she also broke the record.',
          'Under no circumstances should you share your password.',
        ],
      },
      {
        name: 'Cleft sentences',
        rule: 'Use "What… is/was…" or "It is/was… that…" to focus on one part of the sentence.',
        ar: 'الجمل المشطورة للتركيز: What I need is time / It was Sara who solved the problem.',
        examples: ['What we need is a clear strategy.', 'It was the price that put me off.'],
      },
    ],
    vocab: [
      ['compelling', '/kəmˈpelɪŋ/', 'مقنع / جذّاب جدًا', 'She made a compelling argument.'],
      ['undermine', '/ˌʌndəˈmaɪn/', 'يقوّض / يُضعف', 'Constant criticism can undermine confidence.'],
      ['underlying', '/ˌʌndəˈlaɪɪŋ/', 'كامن / أساسي', 'We need to address the underlying causes.'],
      ['far-reaching', '/ˌfɑːˈriːtʃɪŋ/', 'بعيد المدى', 'The reform had far-reaching consequences.'],
      ['acknowledge', '/əkˈnɒlɪdʒ/', 'يعترف بـ / يُقرّ', 'We must acknowledge our mistakes.'],
      ['notion', '/ˈnəʊʃn/', 'فكرة / مفهوم', 'I reject the notion that talent is everything.'],
    ],
    dialogue: {
      title: 'Panel discussion',
      setting: 'You speak on a panel about education reform.',
      turns: [
        {
          bot: 'Many say talent matters more than effort. Do you agree?',
          expect: {
            keywords: ['notion|idea|believe|argue|agree|disagree'],
            sample: 'I would challenge that notion. What really matters is consistent, deliberate practice.',
          },
        },
        {
          bot: 'What do you see as the underlying problem in schools today?',
          expect: {
            keywords: ['underlying|problem|issue|what|it is'],
            sample: 'What concerns me most is that the system rewards memorisation rather than understanding.',
          },
        },
        {
          bot: 'If you could change one thing, what would it be?',
          expect: {
            keywords: ['would|not only|never|only'],
            sample: 'Not only would I reduce exam pressure, but I would also train teachers in project-based learning.',
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'Rarely ___ such a compelling speech.',
        options: ['I have heard', 'have I heard', 'I heard', 'did I heard'],
        answer: 'have I heard',
        explanation: 'Negative adverbial first → auxiliary + subject (inversion).',
      },
      {
        type: 'gap_fill',
        prompt: 'Not only ___ he arrive late, but he also forgot the documents.',
        answer: 'did',
        explanation: 'Past simple inversion uses did + subject + base verb.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['should', 'circumstances', 'under', 'no', 'you', 'share', 'password', 'your'],
        answer:
          'Under no circumstances should you share your password.|Under no circumstances should you share your password',
        explanation: 'Under no circumstances + modal + subject.',
      },
      {
        type: 'translate',
        prompt: 'ما نحتاجه حقًا هو خطة واضحة.',
        answer:
          'What we really need is a clear plan.|What we really need is a clear strategy.|What we need is a clear plan.',
        explanation: 'Arabic "ما… هو…" maps neatly to an English "What… is…" cleft sentence.',
      },
      {
        type: 'dictation',
        prompt: 'The reform had far-reaching consequences that nobody had anticipated.',
        answer: 'The reform had far-reaching consequences that nobody had anticipated.',
        explanation: 'Past perfect (had anticipated) for the earlier past.',
      },
      {
        type: 'speaking',
        prompt: 'Argue for a change in your city. Use one inversion and one cleft sentence.',
        options: ['never|not only|rarely|seldom|only|under no', 'what|it is|it was'],
        answer:
          'What our city really needs is reliable public transport. Not only would it reduce traffic, but it would also cut pollution dramatically.',
        explanation: 'Cleft for focus, inversion for rhetorical force.',
      },
    ],
    dictation: [
      { sentence: 'Never have I seen such a compelling argument.', hidden: ['Never', 'compelling'] },
      { sentence: 'We must acknowledge the underlying causes.', hidden: ['acknowledge', 'underlying'] },
    ],
  }),

  unit({
    level: 'C1',
    order: 3,
    title: 'Reading between the lines',
    theme: 'nuance',
    minutes: 20,
    grammar: [
      {
        name: 'Mixed conditionals',
        rule: 'Mix time frames: past condition → present result (If I had studied medicine, I would be a doctor now), or present condition → past result (If I were braver, I would have said something).',
        ar: "الشرط المختلط: شرط في الماضي ونتيجة في الحاضر (If I had taken the job, I would be in Dubai now)، أو العكس (If I weren't so shy, I would have spoken up).",
        examples: [
          'If I had taken that job, I would be living in Dubai now.',
          "If she weren't so stubborn, she would have accepted the offer.",
        ],
      },
    ],
    vocab: [
      ['subtle', '/ˈsʌtl/', 'دقيق / خفي', 'There is a subtle difference between the two words.'],
      ['imply', '/ɪmˈplaɪ/', 'يُلمّح / يدلّ ضمنيًا', 'Are you implying that I lied?'],
      ['ambiguous', '/æmˈbɪɡjuəs/', 'غامض / يحتمل أكثر من معنى', 'The wording of the contract is ambiguous.'],
      [
        'take something with a pinch of salt',
        '/teɪk ... wɪð ə pɪntʃ əv sɔːlt/',
        'لا يصدّق الشيء تمامًا / يتحفّظ عليه',
        'Take online reviews with a pinch of salt.',
        ['idioms'],
      ],
      [
        'hit the nail on the head',
        '/hɪt ðə neɪl ɒn ðə hed/',
        'أصاب كبد الحقيقة',
        'You hit the nail on the head with that comment.',
        ['idioms'],
      ],
      [
        'in hindsight',
        '/ɪn ˈhaɪndsaɪt/',
        'بعد فوات الأوان / عند النظر للوراء',
        'In hindsight, I should have accepted the offer.',
      ],
    ],
    dialogue: {
      title: 'Looking back',
      setting: 'A mentor asks you to reflect on a past decision.',
      turns: [
        {
          bot: 'Looking back, is there a decision you would make differently?',
          expect: {
            keywords: ['hindsight|looking back|would|if|had'],
            sample: 'In hindsight, I would have studied abroad. If I had gone, I would probably be more confident now.',
          },
        },
        {
          bot: 'Interesting. What stopped you at the time?',
          expect: {
            keywords: ["if|weren't|wasn't|were|had|because"],
            sample: "If I weren't so cautious by nature, I would have taken the risk.",
          },
        },
        {
          bot: 'People often say "everything happens for a reason". Do you buy that?',
          expect: {
            keywords: ['pinch of salt|agree|disagree|notion|think|believe|ambiguous'],
            sample:
              'I take that idea with a pinch of salt — it can be comforting, but it can also stop us from learning from mistakes.',
          },
        },
      ],
    },
    exercises: [
      {
        type: 'mcq',
        prompt: 'If I ___ harder at school, I would have a better job now.',
        options: ['studied', 'had studied', 'would study', 'have studied'],
        answer: 'had studied',
        explanation: 'Past condition (had studied) → present result (would have): mixed conditional.',
      },
      {
        type: 'gap_fill',
        prompt: 'In ___, it was a terrible idea to invest all our savings.',
        answer: 'hindsight|retrospect',
        explanation: '"In hindsight" = looking back now with more knowledge.',
      },
      {
        type: 'word_order',
        prompt: 'Put the words in order.',
        options: ['implying', 'are', 'that', 'you', 'wrong', 'I', 'was', '?'],
        answer: 'Are you implying that I was wrong?|Are you implying that I was wrong',
        explanation: '"imply" = suggest something without saying it directly.',
      },
      {
        type: 'translate',
        prompt: 'لو لم أفوّت الطائرة، لكنت في لندن الآن.',
        answer:
          "If I hadn't missed the plane, I would be in London now.|If I had not missed the plane, I would be in London now.|If I hadn't missed the flight, I would be in London now.|If I had not missed the flight, I would be in London now.",
        explanation: 'Past condition → present result.',
      },
      {
        type: 'dictation',
        prompt: 'The wording is ambiguous, so take it with a pinch of salt.',
        answer: 'The wording is ambiguous, so take it with a pinch of salt.',
        explanation: 'Idiom: "take something with a pinch of salt".',
      },
      {
        type: 'speaking',
        prompt: 'Reflect on a past choice and how your life would be different now. Use a mixed conditional.',
        options: ['if', 'had', 'would'],
        answer: "If I hadn't joined that volunteering programme, I wouldn't be working in education today.",
        explanation: 'If + past perfect, would + verb (now).',
      },
    ],
    dictation: [
      { sentence: 'There is a subtle difference between these two words.', hidden: ['subtle', 'difference'] },
      { sentence: 'You really hit the nail on the head.', hidden: ['nail', 'head'] },
    ],
  }),
];

/** Bump whenever CURRICULUM changes, so `seed()` re-syncs content into existing databases. */
export const CURRICULUM_VERSION = 1;
