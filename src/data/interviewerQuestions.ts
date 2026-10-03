import type { InterviewerQuestion } from '../App';

export const INITIAL_INTERVIEWER_QUESTIONS: InterviewerQuestion[] = [
  // 1. Background & Motivation
  { id: 'iq1', category: 'Background & Motivation', text: "Tell me about yourself — walk me through your background." },
  { id: 'iq2', category: 'Background & Motivation', text: "Why are you interested in this specific role?" },
  { id: 'iq3', category: 'Background & Motivation', text: "Why are you interested in our company specifically?" },
  { id: 'iq4', category: 'Background & Motivation', text: "What do you know about what we do, and why does it resonate with you?" },
  { id: 'iq5', category: 'Background & Motivation', text: "What are you looking for in your next opportunity that you don't have now?" },
  { id: 'iq6', category: 'Background & Motivation', text: "Why are you leaving your current/last position?" },
  { id: 'iq7', category: 'Background & Motivation', text: "Where do you see yourself in 3–5 years?" },
  { id: 'iq8', category: 'Background & Motivation', text: "Why are you transitioning into [strategy / data / consulting / VC]?" },
  { id: 'iq9', category: 'Background & Motivation', text: "What drew you to the life sciences / pharma / biotech sector?" },
  { id: 'iq10', category: 'Background & Motivation', text: "How did you become interested in AI and data applied to this industry?" },
  { id: 'iq11', category: 'Background & Motivation', text: "What's the most important thing you're optimizing for in your next role?" },
  { id: 'iq12', category: 'Background & Motivation', text: "Why Montreal — are you open to relocation or travel if needed?" },

  // 2. Strategic Thinking
  { id: 'iq13', category: 'Strategic Thinking', text: "Walk me through a time you had to solve an ambiguous problem with limited information." },
  { id: 'iq14', category: 'Strategic Thinking', text: "How do you approach a problem you've never seen before?" },
  { id: 'iq15', category: 'Strategic Thinking', text: "If you were advising our leadership team on one strategic priority, what would it be and why?" },
  { id: 'iq16', category: 'Strategic Thinking', text: "Tell me about a time you identified an opportunity that others had missed." },
  { id: 'iq17', category: 'Strategic Thinking', text: "How do you balance short-term execution with long-term strategic thinking?" },
  { id: 'iq18', category: 'Strategic Thinking', text: "Describe a situation where you had to make a recommendation with incomplete data." },
  { id: 'iq19', category: 'Strategic Thinking', text: "How do you structure your thinking when entering a new industry or market?" },
  { id: 'iq20', category: 'Strategic Thinking', text: "Walk me through a strategic decision you made that turned out to be wrong. What did you learn?" },
  { id: 'iq21', category: 'Strategic Thinking', text: "How do you prioritize when everything feels urgent?" },
  { id: 'iq22', category: 'Strategic Thinking', text: "Tell me about a time you influenced a major decision without having direct authority." },

  // 3. Data, Analytics & AI
  { id: 'iq23', category: 'Data, Analytics & AI', text: "What data tools and platforms are you most comfortable working with?" },
  { id: 'iq24', category: 'Data, Analytics & AI', text: "Walk me through a project where data directly drove a business decision." },
  { id: 'iq25', category: 'Data, Analytics & AI', text: "How do you communicate complex data findings to a non-technical audience?" },
  { id: 'iq26', category: 'Data, Analytics & AI', text: "Describe a time your analysis was challenged. How did you respond?" },
  { id: 'iq27', category: 'Data, Analytics & AI', text: "How do you validate that your data is reliable before presenting conclusions?" },
  { id: 'iq28', category: 'Data, Analytics & AI', text: "What's your experience with machine learning models in a business context?" },
  { id: 'iq29', category: 'Data, Analytics & AI', text: "How have you used AI tools to improve your workflow or output?" },
  { id: 'iq30', category: 'Data, Analytics & AI', text: "What's the difference between a good insight and an interesting data point?" },
  { id: 'iq31', category: 'Data, Analytics & AI', text: "Describe a dashboard or reporting system you built or improved." },
  { id: 'iq32', category: 'Data, Analytics & AI', text: "Have you worked with large or messy datasets? How did you handle data quality issues?" },
  { id: 'iq33', category: 'Data, Analytics & AI', text: "How do you decide which metric matters most in a given context?" },
  { id: 'iq34', category: 'Data, Analytics & AI', text: "What's your experience with Python, R, SQL, or BI tools like Tableau or Power BI?" },

  // 4. Consulting-Specific
  { id: 'iq35', category: 'Consulting-Specific', text: "How do you structure a client presentation from scratch?" },
  { id: 'iq36', category: 'Consulting-Specific', text: "Describe a time you had to manage a difficult client or stakeholder." },
  { id: 'iq37', category: 'Consulting-Specific', text: "How do you handle pushback on your recommendations?" },
  { id: 'iq38', category: 'Consulting-Specific', text: "Walk me through a project where you had to deliver a tough message." },
  { id: 'iq39', category: 'Consulting-Specific', text: "How do you manage your time across multiple workstreams simultaneously?" },
  { id: 'iq40', category: 'Consulting-Specific', text: "What frameworks do you use most often when approaching a new mandate?" },
  { id: 'iq41', category: 'Consulting-Specific', text: "Tell me about a time you had to get up to speed very quickly on an unfamiliar topic." },
  { id: 'iq42', category: 'Consulting-Specific', text: "How do you build trust with a client in the first few weeks of an engagement?" },
  { id: 'iq43', category: 'Consulting-Specific', text: "What makes a great consultant in your view — and how do you measure up?" },
  { id: 'iq44', category: 'Consulting-Specific', text: "How do you handle situations where the client disagrees with your analysis?" },

  // 5. VC & Finance-Specific
  { id: 'iq45', category: 'VC & Finance-Specific', text: "How do you evaluate a company at an early stage when there's limited financial data?" },
  { id: 'iq46', category: 'VC & Finance-Specific', text: "What makes a founding team fundable in your opinion?" },
  { id: 'iq47', category: 'VC & Finance-Specific', text: "Walk me through how you'd conduct due diligence on a biotech startup." },
  { id: 'iq48', category: 'VC & Finance-Specific', text: "What's a sector or therapeutic area you find particularly compelling right now and why?" },
  { id: 'iq49', category: 'VC & Finance-Specific', text: "How do you think about risk when evaluating an investment opportunity?" },
  { id: 'iq50', category: 'VC & Finance-Specific', text: "Tell me about a company you've studied that you think is undervalued or overlooked." },
  { id: 'iq51', category: 'VC & Finance-Specific', text: "How do you distinguish between a good technology and a good business?" },
  { id: 'iq52', category: 'VC & Finance-Specific', text: "What metrics do you track to evaluate portfolio company performance?" },
  { id: 'iq53', category: 'VC & Finance-Specific', text: "How do you stay current on market trends in life sciences and health tech?" },
  { id: 'iq54', category: 'VC & Finance-Specific', text: "What's your understanding of how a VC fund generates returns?" },

  // 6. Pharma & Life Sciences Knowledge
  { id: 'iq55', category: 'Pharma & Life Sciences Knowledge', text: "How familiar are you with the drug development process from discovery to commercialization?" },
  { id: 'iq56', category: 'Pharma & Life Sciences Knowledge', text: "What's your understanding of the regulatory landscape in Canada and the US for biotech?" },
  { id: 'iq57', category: 'Pharma & Life Sciences Knowledge', text: "How do you think AI is changing drug discovery — and what are its limits?" },
  { id: 'iq58', category: 'Pharma & Life Sciences Knowledge', text: "What's a recent development in the life sciences space that you find exciting?" },
  { id: 'iq59', category: 'Pharma & Life Sciences Knowledge', text: "How would you approach a market assessment for a drug entering a competitive therapeutic area?" },
  { id: 'iq60', category: 'Pharma & Life Sciences Knowledge', text: "What's your experience working with cross-functional teams in a scientific or clinical environment?" },
  { id: 'iq61', category: 'Pharma & Life Sciences Knowledge', text: "How do you think about patient access and pricing strategy in pharma?" },
  { id: 'iq62', category: 'Pharma & Life Sciences Knowledge', text: "What do you know about Health Canada's approval process vs. the FDA?" },
  { id: 'iq63', category: 'Pharma & Life Sciences Knowledge', text: "How would you explain the concept of a clinical trial to a non-scientist stakeholder?" },

  // 7. Collaboration & Communication
  { id: 'iq64', category: 'Collaboration & Communication', text: "Tell me about a time you worked with a team that had very different working styles than yours." },
  { id: 'iq65', category: 'Collaboration & Communication', text: "How do you give feedback to a colleague who isn't performing well?" },
  { id: 'iq66', category: 'Collaboration & Communication', text: "Describe a situation where you had to navigate a conflict within your team." },
  { id: 'iq67', category: 'Collaboration & Communication', text: "How do you adapt your communication style depending on your audience?" },
  { id: 'iq68', category: 'Collaboration & Communication', text: "Tell me about a time you had to align multiple stakeholders with competing interests." },
  { id: 'iq69', category: 'Collaboration & Communication', text: "What's your approach to working with people who are more senior than you?" },
  { id: 'iq70', category: 'Collaboration & Communication', text: "How do you make sure your ideas are heard in a room dominated by strong personalities?" },
  { id: 'iq71', category: 'Collaboration & Communication', text: "Tell me about a time you had to influence someone who didn't report to you." },
  { id: 'iq72', category: 'Collaboration & Communication', text: "How do you build relationships quickly when joining a new team or project?" },

  // 8. Growth, Ambition & Learning Agility
  { id: 'iq73', category: 'Growth, Ambition & Learning Agility', text: "What's the most important professional skill you've developed in the last two years?" },
  { id: 'iq74', category: 'Growth, Ambition & Learning Agility', text: "Tell me about a time you stepped outside your comfort zone at work." },
  { id: 'iq75', category: 'Growth, Ambition & Learning Agility', text: "How do you stay current in a fast-moving field like AI or biotech?" },
  { id: 'iq76', category: 'Growth, Ambition & Learning Agility', text: "What's the hardest feedback you've ever received, and how did you act on it?" },
  { id: 'iq77', category: 'Growth, Ambition & Learning Agility', text: "Describe a time you had to learn something completely new under time pressure." },
  { id: 'iq78', category: 'Growth, Ambition & Learning Agility', text: "What does career growth mean to you, and how do you pursue it deliberately?" },
  { id: 'iq79', category: 'Growth, Ambition & Learning Agility', text: "Tell me about a project you initiated on your own — not because you were asked to." },
  { id: 'iq80', category: 'Growth, Ambition & Learning Agility', text: "What's a skill you're actively working on improving right now?" },
  { id: 'iq81', category: 'Growth, Ambition & Learning Agility', text: "How do you decide when to go deep on a topic vs. when breadth is more valuable?" },

  // 9. Problem-Solving & Execution
  { id: 'iq82', category: 'Problem-Solving & Execution', text: "Tell me about the most complex project you've managed from start to finish." },
  { id: 'iq83', category: 'Problem-Solving & Execution', text: "Walk me through a time you had to deliver results under a very tight deadline." },
  { id: 'iq84', category: 'Problem-Solving & Execution', text: "How do you handle situations where the scope of a project keeps expanding?" },
  { id: 'iq85', category: 'Problem-Solving & Execution', text: "Describe a time you had to course-correct mid-project. What happened and what did you do?" },
  { id: 'iq86', category: 'Problem-Solving & Execution', text: "How do you break down a large, undefined problem into actionable steps?" },
  { id: 'iq87', category: 'Problem-Solving & Execution', text: "Tell me about a time something you built or delivered didn't land as expected." },
  { id: 'iq88', category: 'Problem-Solving & Execution', text: "How do you manage competing priorities when everything is labeled 'urgent'?" },
  { id: 'iq89', category: 'Problem-Solving & Execution', text: "Tell me about a time you had to push back on an unrealistic expectation." },
  { id: 'iq90', category: 'Problem-Solving & Execution', text: "What tools or systems do you use to stay organized and on top of your work?" },

  // 10. Compensation, Fit & Logistics
  { id: 'iq91', category: 'Compensation, Fit & Logistics', text: "What are your salary expectations?" },
  { id: 'iq92', category: 'Compensation, Fit & Logistics', text: "Are you currently interviewing elsewhere? Where are you in those processes?" },
  { id: 'iq93', category: 'Compensation, Fit & Logistics', text: "What's your ideal start date?" },
  { id: 'iq94', category: 'Compensation, Fit & Logistics', text: "Are you comfortable with the travel requirements this role may involve?" },
  { id: 'iq95', category: 'Compensation, Fit & Logistics', text: "This role requires [X] — is that something you're comfortable with?" },
  { id: 'iq96', category: 'Compensation, Fit & Logistics', text: "What would make you choose us over a competing offer?" },
  { id: 'iq97', category: 'Compensation, Fit & Logistics', text: "Is there anything on your resume you'd like to clarify or expand on?" },
  { id: 'iq98', category: 'Compensation, Fit & Logistics', text: "What does your ideal manager look like?" },
  { id: 'iq99', category: 'Compensation, Fit & Logistics', text: "Is there anything that would prevent you from accepting an offer if we extended one?" },
  { id: 'iq100', category: 'Compensation, Fit & Logistics', text: "Do you have any questions for us?" }, // Standard closure
];
