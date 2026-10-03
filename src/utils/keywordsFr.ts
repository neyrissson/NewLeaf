// French counterparts of the built-in filter terms, so French (Québec / France) postings are judged
// the same way as English ones. Keyed by the English term each one translates; terms that are
// spelled the same in both languages (python, ngs, crispr, biotech, pharma, helpdesk …) need no entry.
// Matching ignores accents and case (see textFold.ts), so "génétique" also matches "GENETIQUE".
//
// Deliberately NOT here: a bare "recherche". It is the French twin of "research", but "à la
// recherche de …" ("looking for …") opens most French postings, so it would wave every one of
// them through the relevance filter. Specific phrases ("recherche scientifique", "chercheur" …)
// carry that meaning instead.

import { foldText } from './textFold';

// Description keywords (a job needs ≥1 of these).
export const FR_POSITIVE: Record<string, string[]> = {
  'life science': ['science de la vie', 'science du vivant'],
  'life sciences': ['sciences de la vie', 'sciences du vivant'],
  'biology': ['biologie'],
  'biological': ['biologique', 'biologiques'],
  'biologist': ['biologiste', 'biologistes'],
  'biotechnology': ['biotechnologie', 'biotechnologies'],
  'genetics': ['génétique', 'génétiques'],
  'genetic': ['génétique', 'génétiques'],
  'genomic': ['génomique', 'génomiques'],
  'genomics': ['génomique', 'génomiques'],
  'molecular': ['moléculaire', 'moléculaires'],
  'cellular': ['cellulaire', 'cellulaires'],
  'dna': ['adn'],
  'rna': ['arn'],
  'protein': ['protéine', 'protéines'],
  'proteomics': ['protéomique', 'protéomiques'],
  'epigenetic': ['épigénétique', 'épigénétiques'],
  'epigenetics': ['épigénétique', 'épigénétiques'],
  'epigenomic': ['épigénomique', 'épigénomiques'],
  'epigenomics': ['épigénomique', 'épigénomiques'],
  'chromatin': ['chromatine'],
  'sequencing': ['séquençage', 'séquençages'],
  'gene': ['gènes'],
  'genome': ['génomes'],
  'bioinformatics': ['bio-informatique', 'bioinformatique', 'bio-informatiques', 'bioinformatiques'],
  'bioinformatic': ['bio-informatique', 'bioinformatique', 'bio-informatiques', 'bioinformatiques'],
  'computational': ['computationnel', 'computationnelle', 'computationnels', 'computationnelles'],
  'machine learning': ['apprentissage automatique', 'apprentissage machine'],
  'deep learning': ['apprentissage profond'],
  'llm': ['grand modèle de langage', 'grands modèles de langage'],
  'ai': ['ia', 'intelligence artificielle'],
  // AI / AI-safety
  'ai safety': ["sécurité de l'ia", "sûreté de l'ia", "sécurité de l'intelligence artificielle"],
  'ai alignment': ["alignement de l'ia", "alignement de l'intelligence artificielle"],
  'alignment': ['alignement'],
  'red team': ['équipe rouge', 'équipes rouges'],
  'interpretability': ['interprétabilité'],
  'frontier model': ['modèle de pointe', 'modèles de pointe', 'modèle frontière', 'modèles frontières'],
  'frontier ai': ["ia de pointe", "ia frontière"],
  'responsible ai': ['ia responsable', 'intelligence artificielle responsable'],
  'trust and safety': ['confiance et sécurité', 'confiance et sûreté'],
  'model evaluation': ['évaluation de modèle', 'évaluation de modèles', 'évaluation des modèles'],
  'safety research': ['recherche en sécurité', 'recherche sur la sécurité'],
  'agentic': ['agentique', 'agentiques'],
  'data science': ['science des données', 'sciences des données', 'science de données'],
  'data scientist': ['scientifique des données', 'scientifique de données', 'scientifiques des données'],
  'scientist': ['scientifique', 'scientifiques'],
  'scientific': ['scientifique', 'scientifiques'],
  'research': [
    'recherche scientifique', 'recherche et développement', 'recherche fondamentale', 'recherche appliquée',
    'recherche clinique', 'recherche préclinique', 'recherche biomédicale', 'recherche pharmaceutique',
    'recherche translationnelle', 'chercheur', 'chercheuse', 'chercheurs', 'chercheuses'
  ],
  'laboratory': ['laboratoire', 'laboratoires'],
  'assay': ['essai biologique', 'essais biologiques', 'essai cellulaire', 'essais cellulaires', "développement d'essais"],
  'immunology': ['immunologie'],
  'oncology': ['oncologie'],
  'neuroscience': ['neuroscience', 'neurosciences'],
  'microbiology': ['microbiologie'],
  'biochemistry': ['biochimie'],
  'biophysics': ['biophysique'],
  'chemistry': ['chimie'],
  'chemist': ['chimiste', 'chimistes'],
  'drug': ['médicament', 'médicaments'],
  'therapeutic': ['thérapeutique', 'thérapeutiques'],
  'therapeutics': ['thérapeutique', 'thérapeutiques'],
  'pharmaceutical': ['pharmaceutique', 'pharmaceutiques'],
  'clinical': ['clinique', 'cliniques'],
  'preclinical': ['préclinique', 'précliniques'],
  'translational': ['translationnel', 'translationnelle', 'translationnels', 'translationnelles'],
  'consultant': ['consultante', 'consultants', 'consultantes'],
  'consulting': [
    'cabinet de conseil', 'cabinets de conseil', 'firme de conseil', 'firmes de conseil',
    'services-conseils', 'services-conseil', 'conseil en stratégie', 'conseil en gestion'
  ],
  'strategy': ['stratégie', 'stratégies'],
  'strategic': ['stratégique', 'stratégiques'],
  'venture': ['capital de risque', 'capital-risque'],
  'business development': ['développement des affaires', "développement d'affaires", 'développement commercial'],
};

// Wrong-function title terms (a title containing one of these is dismissed). Same careful scope as the
// English list: no sales / account-exec roles, and nurse terms kept specific so "infirmière en
// recherche clinique" isn't swept up.
export const FR_NEGATIVE: Record<string, string[]> = {
  // Support / service
  'customer service': ['service à la clientèle', 'service client', 'service clients', 'relation client', 'relations avec la clientèle'],
  'customer success': ['succès client', 'réussite client'],
  'help desk': ["service d'assistance", "centre d'assistance", 'service de dépannage'],
  'technical support': ['soutien technique', 'support technique', 'assistance technique'],
  'desktop support': ['soutien informatique', 'support informatique', 'soutien aux utilisateurs', 'support aux utilisateurs'],
  // HR / recruiting
  'recruiter': [
    'recruteur', 'recruteuse', 'recruteurs', 'recruteuses', 'chargé de recrutement', 'chargée de recrutement',
    'conseiller en recrutement', 'conseillère en recrutement', 'spécialiste en recrutement', 'agent de recrutement', 'agente de recrutement'
  ],
  'talent acquisition': ['acquisition de talents', 'acquisition des talents', 'acquisition de talent'],
  'human resources': ['ressources humaines'],
  'hr generalist': ['généraliste en ressources humaines', 'généraliste des ressources humaines', 'généraliste rh'],
  'hr business partner': ["partenaire d'affaires rh", "partenaire d'affaires en ressources humaines", 'partenaire rh'],
  'payroll': ['paie', 'paye'],
  'benefits administrator': [
    'administrateur des avantages sociaux', 'administratrice des avantages sociaux',
    'conseiller en avantages sociaux', 'conseillère en avantages sociaux'
  ],
  // Finance-clerical
  'accounts payable': ['comptes fournisseurs', 'comptes payables', 'comptabilité fournisseurs'],
  'accounts receivable': ['comptes clients', 'comptes recevables', 'comptabilité clients'],
  'bookkeeper': ['teneur de livres', 'teneuse de livres', 'commis comptable', 'commis à la comptabilité'],
  'staff accountant': [
    'comptable junior', 'comptable intermédiaire', 'technicien comptable', 'technicienne comptable',
    'technicien en comptabilité', 'technicienne en comptabilité'
  ],
  // Admin
  'receptionist': ['réceptionniste', 'réceptionnistes'],
  'executive assistant': [
    'adjoint de direction', 'adjointe de direction', 'assistant de direction', 'assistante de direction',
    'adjoint exécutif', 'adjointe exécutive', 'assistant exécutif', 'assistante exécutive'
  ],
  'administrative assistant': ['adjoint administratif', 'adjointe administrative', 'assistant administratif', 'assistante administrative'],
  'office manager': ['gestionnaire de bureau', 'responsable de bureau'],
  'office coordinator': [
    'coordonnateur de bureau', 'coordonnatrice de bureau', 'coordinateur de bureau', 'coordinatrice de bureau',
    'coordonnateur administratif', 'coordonnatrice administrative'
  ],
  // Ops / trades
  // (no bare "entrepôt": "entrepôt de données" is a data-warehouse engineering title, not a stockroom job)
  'warehouse': [
    "commis d'entrepôt", "préposé à l'entrepôt", "préposée à l'entrepôt", "employé d'entrepôt", "employée d'entrepôt",
    'magasinier', 'magasinière', 'magasiniers', 'manutentionnaire', 'manutentionnaires'
  ],
  'forklift': ['chariot élévateur', 'chariots élévateurs', 'cariste', 'caristes'],
  'machine operator': ['opérateur de machine', 'opératrice de machine', 'opérateur de machines', 'opératrice de machines'],
  'production operator': ['opérateur de production', 'opératrice de production', 'opérateur en production', 'opératrice en production'],
  'assembler': ['assembleur', 'assembleuse'],
  'maintenance technician': [
    "technicien d'entretien", "technicienne d'entretien", 'technicien de maintenance', 'technicienne de maintenance',
    'technicien en maintenance', 'technicienne en maintenance'
  ],
  // (no bare "concierge": it's also an English service-role word — "Technical Concierge", "Patient Concierge")
  'janitor': ["préposé à l'entretien ménager", "préposée à l'entretien ménager"],
  'custodian': ["agent d'entretien", "agente d'entretien", "préposé à l'entretien", "préposée à l'entretien"],
  'security guard': ['agent de sécurité', 'agente de sécurité', 'gardien de sécurité', 'gardienne de sécurité'],
  'housekeeping': ['entretien ménager', 'femme de chambre', 'valet de chambre'],
  // Clinical care
  'registered nurse': [
    'infirmier autorisé', 'infirmière autorisée', 'infirmiers autorisés', 'infirmières autorisées',
    'infirmier immatriculé', 'infirmière immatriculée'
  ],
  'nurse practitioner': ['infirmière praticienne', 'infirmier praticien', 'infirmières praticiennes', 'infirmiers praticiens'],
  'phlebotomist': ['phlébotomiste', 'phlébotomistes'],
  'medical assistant': ['assistant médical', 'assistante médicale', 'auxiliaire médical', 'auxiliaire médicale'],
  'pharmacy technician': [
    'technicien en pharmacie', 'technicienne en pharmacie',
    'assistant technique en pharmacie', 'assistante technique en pharmacie'
  ],
  'patient care': ['soins aux patients', 'soins aux patientes', 'soins des patients'],
  // Legal / facilities
  'paralegal': ['parajuriste', 'parajuristes', 'technicien juridique', 'technicienne juridique'],
  'facilities': [
    'gestionnaire des installations', "gestionnaire d'installations", 'responsable des installations',
    'gestionnaire des immeubles', "gestionnaire d'immeubles", 'gestionnaire immobilier'
  ],
};

const normalise = (s: string) => foldText(s).trim().toLowerCase();

// `list` plus the French counterpart of every term in it that has one. Terms already present (ignoring
// accents/case) aren't repeated, so running this twice, or on a list that already has some French, is safe.
export const withFrench = (list: string[], map: Record<string, string[]>): string[] => {
  const seen = new Set(list.map(normalise));
  const out = [...list];
  for (const term of list) {
    for (const fr of map[term.trim().toLowerCase()] ?? []) {
      const key = normalise(fr);
      if (!seen.has(key)) { seen.add(key); out.push(fr); }
    }
  }
  return out;
};
