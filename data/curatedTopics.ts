/**
 * Curated Topics - Pre-made curriculum structures for home page showcase
 * These provide a quick start - users click to see curriculum, then generate content
 */

import { CurriculumData } from '../types';

export interface CuratedTopic {
  id: string;
  title: string;
  tagline: string;
  imageKeyword: string; // Keyword for Wikimedia API image search
  curriculum: CurriculumData;
}

// Helper to build Wikimedia Commons API URL for image search
export function getWikimediaImageUrl(keyword: string): string {
  const params = new URLSearchParams({
    origin: '*',
    action: 'query',
    generator: 'search',
    gsrsearch: `${keyword} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '1',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '400',
    format: 'json'
  });
  return `https://commons.wikimedia.org/w/api.php?${params}`;
}

export const CURATED_TOPICS: CuratedTopic[] = [
  {
    id: 'manhattan-project',
    title: 'The Manhattan Project',
    tagline: 'The secret race that changed warfare forever',
    imageKeyword: 'atomic bomb mushroom cloud',
    curriculum: {
      title: 'The Manhattan Project: Building the Atomic Age',
      overview: 'Explore the secret World War II program that developed the first nuclear weapons, from scientific discoveries to ethical debates.',
      description: 'A journey through one of history\'s most consequential scientific endeavors',
      learningGoals: [
        'Understand the scientific principles behind nuclear fission',
        'Learn about key figures like Oppenheimer and Fermi',
        'Explore the ethical implications that still resonate today',
        'Analyze the geopolitical impact on the post-war world'
      ],
      modules: [
        { id: 'm1', title: 'The Road to Los Alamos', description: 'How Einstein\'s letter to Roosevelt sparked a secret revolution', slides: [{ id: 's1', title: 'Einstein\'s Warning', description: 'The letter that started it all' }, { id: 's2', title: 'Assembling the Geniuses', description: 'Recruiting the world\'s best minds' }, { id: 's3', title: 'The Secret City', description: 'Life in Los Alamos' }] },
        { id: 'm2', title: 'The Science of the Bomb', description: 'Understanding nuclear fission and chain reactions', slides: [{ id: 's1', title: 'Splitting the Atom', description: 'Nuclear fission explained' }, { id: 's2', title: 'Critical Mass', description: 'The physics of chain reactions' }, { id: 's3', title: 'Two Designs', description: 'Little Boy vs Fat Man' }] },
        { id: 'm3', title: 'Trinity and Beyond', description: 'The first test and the dawn of the atomic age', slides: [{ id: 's1', title: 'The Trinity Test', description: 'July 16, 1945 - the world changed' }, { id: 's2', title: 'Hiroshima and Nagasaki', description: 'The devastating reality' }, { id: 's3', title: 'The Aftermath', description: 'Oppenheimer\'s regret' }] },
        { id: 'm4', title: 'Legacy and Ethics', description: 'The lasting impact on science, politics, and morality', slides: [{ id: 's1', title: 'The Nuclear Arms Race', description: 'Cold War escalation' }, { id: 's2', title: 'Scientists and Conscience', description: 'The moral reckoning' }, { id: 's3', title: 'Modern Implications', description: 'Nuclear technology today' }] }
      ]
    }
  },
  {
    id: 'james-webb',
    title: 'James Webb Telescope',
    tagline: 'Seeing the universe like never before',
    imageKeyword: 'james webb space telescope',
    curriculum: {
      title: 'The James Webb Space Telescope: A New Eye on the Universe',
      overview: 'Discover how the most powerful space telescope ever built is revolutionizing our understanding of the cosmos.',
      description: 'From engineering marvel to cosmic discoveries',
      learningGoals: [
        'Understand JWST\'s groundbreaking technology',
        'Learn how infrared astronomy reveals hidden universe',
        'Explore the telescope\'s major discoveries',
        'Appreciate the engineering challenges overcome'
      ],
      modules: [
        { id: 'm1', title: 'Engineering the Impossible', description: 'How engineers built a 6.5-meter mirror that unfolds in space', slides: [{ id: 's1', title: 'The Sunshield', description: 'Keeping cool at -233°C' }, { id: 's2', title: 'The Golden Mirror', description: '18 hexagonal segments' }, { id: 's3', title: 'L2 Orbit', description: 'A million miles from Earth' }] },
        { id: 'm2', title: 'Seeing in Infrared', description: 'Why infrared light reveals what visible light cannot', slides: [{ id: 's1', title: 'Beyond Visible Light', description: 'The infrared spectrum' }, { id: 's2', title: 'Cosmic Redshift', description: 'Seeing ancient light' }, { id: 's3', title: 'Piercing Dust Clouds', description: 'Revealing stellar nurseries' }] },
        { id: 'm3', title: 'Cosmic Revelations', description: 'The breathtaking discoveries since launch', slides: [{ id: 's1', title: 'The Deep Field', description: 'Thousands of galaxies in a grain of sand' }, { id: 's2', title: 'Exoplanet Atmospheres', description: 'Detecting alien worlds' }, { id: 's3', title: 'The First Galaxies', description: 'Light from 13 billion years ago' }] },
        { id: 'm4', title: 'The Future of Space Observation', description: 'What JWST\'s mission means for astronomy\'s future', slides: [{ id: 's1', title: 'Planned Observations', description: 'The science ahead' }, { id: 's2', title: 'JWST\'s Legacy', description: 'Inspiring next-gen telescopes' }, { id: 's3', title: 'Your Place in the Cosmos', description: 'Connecting to the universe' }] }
      ]
    }
  },
  {
    id: 'van-gogh-art',
    title: 'The Art of Van Gogh',
    tagline: 'Inside the mind of a tortured genius',
    imageKeyword: 'starry night van gogh',
    curriculum: {
      title: 'The Art of Vincent van Gogh: Passion, Pain, and Masterpieces',
      overview: 'Explore the extraordinary life and revolutionary techniques of history\'s most beloved Post-Impressionist painter, from his early struggles to his iconic masterpieces.',
      description: 'Art history meets psychology and human drama',
      learningGoals: [
        'Understand Van Gogh\'s unique artistic techniques and color theory',
        'Trace his artistic evolution from dark beginnings to vibrant expression',
        'Explore the connection between his mental struggles and creativity',
        'Analyze his most famous works including Starry Night and Sunflowers',
        'Appreciate his lasting influence on modern art'
      ],
      modules: [
        { id: 'm1', title: 'The Unlikely Artist', description: 'From failed preacher to revolutionary painter', slides: [{ id: 's1', title: 'Early Life and Struggles', description: 'The path to art was not straight' }, { id: 's2', title: 'The Potato Eaters', description: 'His dark Dutch period' }, { id: 's3', title: 'Discovery of Color', description: 'Moving to Paris changed everything' }, { id: 's4', title: 'Influence of Impressionists', description: 'Learning from the masters' }] },
        { id: 'm2', title: 'Revolutionary Techniques', description: 'How Van Gogh painted emotion itself', slides: [{ id: 's1', title: 'Impasto and Brushwork', description: 'Thick paint, bold strokes' }, { id: 's2', title: 'Color as Emotion', description: 'Yellow for hope, blue for despair' }, { id: 's3', title: 'Complementary Colors', description: 'Making paintings vibrate' }, { id: 's4', title: 'The Night Sky', description: 'Why Starry Night swirls' }] },
        { id: 'm3', title: 'Arles and the Asylum', description: 'The most productive and troubled years', slides: [{ id: 's1', title: 'The Yellow House', description: 'Dreams of an artist colony' }, { id: 's2', title: 'The Ear Incident', description: 'The famous breakdown' }, { id: 's3', title: 'Saint-Rémy', description: 'Painting from the asylum' }, { id: 's4', title: 'Letters to Theo', description: 'A window into his soul' }] },
        { id: 'm4', title: 'Legacy and Influence', description: 'From obscurity to the most valuable artist in history', slides: [{ id: 's1', title: 'Only One Sale', description: 'Fame after death' }, { id: 's2', title: 'Expressionism\'s Father', description: 'Inspiring generations' }, { id: 's3', title: 'Record Auction Prices', description: 'Why his art is priceless' }, { id: 's4', title: 'Van Gogh Today', description: 'Museums and cultural impact' }] }
      ]
    }
  },
  {
    id: 'chatgpt-explained',
    title: 'How ChatGPT Works',
    tagline: 'Understanding the AI that changed everything',
    imageKeyword: 'artificial intelligence neural network',
    curriculum: {
      title: 'How ChatGPT Works: The Technology Behind the Revolution',
      overview: 'Demystify the AI technology powering ChatGPT, from neural networks to reinforcement learning from human feedback.',
      description: 'AI explained for curious minds',
      learningGoals: [
        'Understand transformer architecture basics',
        'Learn how language models predict text',
        'Explore RLHF and fine-tuning',
        'Appreciate capabilities and limitations'
      ],
      modules: [
        { id: 'm1', title: 'The Transformer Revolution', description: 'The architecture that made it all possible', slides: [{ id: 's1', title: 'Attention Is All You Need', description: 'The 2017 breakthrough' }, { id: 's2', title: 'Self-Attention Explained', description: 'How context is captured' }, { id: 's3', title: 'Scaling Laws', description: 'Why bigger is smarter' }] },
        { id: 'm2', title: 'Training a Language Model', description: 'From raw text to coherent responses', slides: [{ id: 's1', title: 'Pre-training on the Web', description: 'Learning from billions of words' }, { id: 's2', title: 'Next Token Prediction', description: 'The core objective' }, { id: 's3', title: 'Emergent Abilities', description: 'When scale creates magic' }] },
        { id: 'm3', title: 'RLHF: Making AI Helpful', description: 'Reinforcement learning from human feedback', slides: [{ id: 's1', title: 'The Alignment Problem', description: 'Raw models aren\'t helpful' }, { id: 's2', title: 'Human Preferences', description: 'Teaching what\'s good' }, { id: 's3', title: 'Reward Models', description: 'Automating human judgment' }] },
        { id: 'm4', title: 'Capabilities and Limits', description: 'What ChatGPT can and cannot do', slides: [{ id: 's1', title: 'Impressive Abilities', description: 'Coding, writing, reasoning' }, { id: 's2', title: 'Hallucinations', description: 'When AI makes things up' }, { id: 's3', title: 'The Future of LLMs', description: 'What\'s next for AI' }] }
      ]
    }
  },
  {
    id: 'digestion',
    title: 'Digestion Explained',
    tagline: 'The incredible journey of your food',
    imageKeyword: 'human digestive system',
    curriculum: {
      title: 'Digestion Explained: The Remarkable Journey of Food',
      overview: 'Follow food through your digestive system, understanding each organ\'s role in breaking down and absorbing nutrients.',
      description: 'Biology meets your breakfast',
      learningGoals: [
        'Trace the complete digestive pathway',
        'Understand enzyme functions and nutrient absorption',
        'Learn about the gut microbiome',
        'Connect digestion to overall health'
      ],
      modules: [
        { id: 'm1', title: 'The Journey Begins', description: 'From mouth to stomach', slides: [{ id: 's1', title: 'Mechanical Breakdown', description: 'Chewing and saliva' }, { id: 's2', title: 'The Esophagus', description: 'Peristalsis in action' }, { id: 's3', title: 'Stomach Acids', description: 'Breaking down proteins' }] },
        { id: 'm2', title: 'The Small Intestine', description: 'Where the magic of absorption happens', slides: [{ id: 's1', title: 'Villi and Microvilli', description: 'Surface area secrets' }, { id: 's2', title: 'Enzyme Action', description: 'Chemical breakdown' }, { id: 's3', title: 'Nutrient Transport', description: 'Into the bloodstream' }] },
        { id: 'm3', title: 'The Gut Microbiome', description: 'Trillions of helpful bacteria', slides: [{ id: 's1', title: 'Bacterial Friends', description: 'Your inner ecosystem' }, { id: 's2', title: 'Fermentation', description: 'What microbes do' }, { id: 's3', title: 'Gut-Brain Axis', description: 'The surprising connection' }] },
        { id: 'm4', title: 'Digestion and Health', description: 'Keeping your digestive system happy', slides: [{ id: 's1', title: 'Common Issues', description: 'When things go wrong' }, { id: 's2', title: 'Diet and Digestion', description: 'Foods that help' }, { id: 's3', title: 'The Healthy Gut', description: 'Best practices' }] }
      ]
    }
  },
  {
    id: 'dangerous-philosophers',
    title: 'Dangerous Philosophers',
    tagline: 'Ideas that shook the world',
    imageKeyword: 'nietzsche portrait',
    curriculum: {
      title: 'The Most Dangerous Philosophers in History',
      overview: 'Explore thinkers whose ideas challenged power, morality, and reality itself - often at great personal cost.',
      description: 'Philosophy that changed (and threatened) civilization',
      learningGoals: [
        'Understand revolutionary philosophical ideas',
        'See how philosophy shaped political movements',
        'Explore the personal costs of dangerous thinking',
        'Evaluate the lasting impact of radical ideas'
      ],
      modules: [
        { id: 'm1', title: 'Socrates: The First Martyr', description: 'Questioning everything, even unto death', slides: [{ id: 's1', title: 'The Socratic Method', description: 'Making people uncomfortable' }, { id: 's2', title: 'Corrupting the Youth', description: 'The charges against him' }, { id: 's3', title: 'The Hemlock Cup', description: 'Dying for ideas' }] },
        { id: 'm2', title: 'Nietzsche: God is Dead', description: 'The philosopher who destroyed traditional morality', slides: [{ id: 's1', title: 'Beyond Good and Evil', description: 'Revaluing all values' }, { id: 's2', title: 'The Übermensch', description: 'Creating new meaning' }, { id: 's3', title: 'Misuse and Legacy', description: 'How ideas get twisted' }] },
        { id: 'm3', title: 'Marx: Revolution\'s Architect', description: 'The philosopher who launched a thousand revolutions', slides: [{ id: 's1', title: 'Class Struggle', description: 'History as conflict' }, { id: 's2', title: 'Das Kapital', description: 'Critique of capitalism' }, { id: 's3', title: 'Real-World Impact', description: 'From theory to revolution' }] },
        { id: 'm4', title: 'Modern Dangerous Thinkers', description: 'Contemporary philosophers disrupting our worldview', slides: [{ id: 's1', title: 'Foucault and Power', description: 'Everywhere and invisible' }, { id: 's2', title: 'Žižek Today', description: 'Pop culture critique' }, { id: 's3', title: 'Why Philosophy Matters', description: 'Ideas still shake worlds' }] }
      ]
    }
  },
  {
    id: 'disturbing-mysteries',
    title: 'Disturbing Mysteries',
    tagline: 'Unsolved cases that haunt us',
    imageKeyword: 'mystery detective investigation',
    curriculum: {
      title: 'Disturbing Mysteries: Cases That Defy Explanation',
      overview: 'Investigate the world\'s most baffling unsolved mysteries, from disappearances to unexplained phenomena.',
      description: 'Where logic meets the inexplicable',
      learningGoals: [
        'Analyze famous unsolved cases',
        'Understand investigative techniques and their limits',
        'Explore psychological aspects of mystery-seeking',
        'Evaluate evidence critically'
      ],
      modules: [
        { id: 'm1', title: 'Vanished Without Trace', description: 'Disappearances that defy explanation', slides: [{ id: 's1', title: 'The Dyatlov Pass', description: '9 hikers, no answers' }, { id: 's2', title: 'Flight MH370', description: 'A plane lost in the digital age' }, { id: 's3', title: 'DB Cooper', description: 'The only unsolved hijacking' }] },
        { id: 'm2', title: 'Cryptic Codes', description: 'Messages no one can decipher', slides: [{ id: 's1', title: 'The Zodiac Killer', description: 'Ciphers that taunt' }, { id: 's2', title: 'Voynich Manuscript', description: 'An unreadable book' }, { id: 's3', title: 'Kryptos at CIA', description: 'The sculpture no one solved' }] },
        { id: 'm3', title: 'Unexplained Phenomena', description: 'Events that challenge our understanding', slides: [{ id: 's1', title: 'The Wow! Signal', description: '72 seconds from space' }, { id: 's2', title: 'Tunguska Event', description: 'The explosion with no crater' }, { id: 's3', title: 'Ball Lightning', description: 'Science still puzzled' }] },
        { id: 'm4', title: 'The Psychology of Mystery', description: 'Why we\'re drawn to the unsolved', slides: [{ id: 's1', title: 'Pattern Seeking', description: 'The brain craves answers' }, { id: 's2', title: 'Conspiracy Thinking', description: 'When explanations go too far' }, { id: 's3', title: 'Living with Uncertainty', description: 'Accepting the unknown' }] }
      ]
    }
  },
  {
    id: 'coffee-science',
    title: 'The Science of Coffee',
    tagline: 'From bean to perfect brew',
    imageKeyword: 'coffee beans roasting',
    curriculum: {
      title: 'The Science of Coffee: Chemistry, Culture, and the Perfect Cup',
      overview: 'Master the fascinating science behind coffee - from the chemistry of roasting to the physics of extraction, and learn to brew the perfect cup.',
      description: 'Where chemistry meets your morning ritual',
      learningGoals: [
        'Understand the chemistry of coffee beans and roasting',
        'Master the science of extraction for optimal flavor',
        'Learn about different brewing methods and their physics',
        'Explore the global coffee trade and sustainability',
        'Develop skills to brew better coffee at home'
      ],
      modules: [
        { id: 'm1', title: 'The Coffee Plant', description: 'From cherry to green bean', slides: [{ id: 's1', title: 'Arabica vs Robusta', description: 'The two main species' }, { id: 's2', title: 'Growing Regions', description: 'Terroir and flavor profiles' }, { id: 's3', title: 'Processing Methods', description: 'Washed, natural, and honey' }, { id: 's4', title: 'The Global Trade', description: 'Coffee\'s economic impact' }] },
        { id: 'm2', title: 'The Roasting Transformation', description: 'How heat creates 800+ flavor compounds', slides: [{ id: 's1', title: 'The Maillard Reaction', description: 'Chemistry of browning' }, { id: 's2', title: 'First and Second Crack', description: 'Key roasting stages' }, { id: 's3', title: 'Light vs Dark Roasts', description: 'Flavor chemistry differences' }, { id: 's4', title: 'Freshness and Storage', description: 'When beans taste best' }] },
        { id: 'm3', title: 'Extraction Science', description: 'The physics of brewing the perfect cup', slides: [{ id: 's1', title: 'The Ideal Extraction', description: '18-22% is the sweet spot' }, { id: 's2', title: 'Variables That Matter', description: 'Grind, time, temperature, ratio' }, { id: 's3', title: 'Under and Over Extraction', description: 'Diagnosing taste problems' }, { id: 's4', title: 'Water Chemistry', description: 'Why water matters so much' }] },
        { id: 'm4', title: 'Brewing Methods Compared', description: 'The science behind each method', slides: [{ id: 's1', title: 'Pour Over', description: 'Clarity and control' }, { id: 's2', title: 'Espresso', description: 'Pressure and concentration' }, { id: 's3', title: 'French Press', description: 'Full immersion brewing' }, { id: 's4', title: 'Your Perfect Cup', description: 'Putting it all together' }] }
      ]
    }
  }
];
