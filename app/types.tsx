export enum POS {
  NOUN = "Noun",
  TRANSITIVE_VERB = "Transitive verb",
  INTRANSITIVE_VERB = "Intransitive verb",
  VERB = "Verb",
  HADA_VERB = "Hada verb",
  ADJECTIVE = "Adjective",
  HADA_ADJECTIVE = "Hada adjective",
  ADVERB = "Adverb",
  PARTICLE = "Particle",
  CONJUNCTION = "Conjunction",
  COUNTER = "Counter",
  INTERJECTION = "Interjection",
  PRONOUN = "Pronoun",
  PREFIX = "Prefix",
  SUFFIX = "Suffix",
  COPULA = "Copula",
  PROPER_NOUN = "Proper noun",
  UNKNOWN = "Word",
}

export interface Entry {
  pos: string
  forms?: Form[]
  word: string
  lang: string
  lang_code: string
  categories?: Category[]
  senses: Sense[]
  head_templates?: HeadTemplate[]
  sounds?: Sound[]
  etymology_text?: string
  etymology_templates?: EtymologyTemplate[]
  etymology_number?: number
  derived?: Derived2[]
  antonyms?: Antonym2[]
  wikipedia?: string[]
  related?: Related2[]
  synonyms?: Synonym2[]
  coordinate_terms?: CoordinateTerm2[]
  descendants?: Descendant[]
  inflection_templates?: InflectionTemplate[]
  meronyms?: Meronym2[]
  form_of?: FormOf2[]
  source?: string
  proverbs?: Proverb[]
  hyponyms?: Hyponym2[]
  hypernyms?: Hypernym2[]
}

export interface Form {
  form: string
  tags?: string[]
  source?: string
  roman?: string
  head_nr?: number
}

export interface Category {
  name: string
  kind: string
  parents: string[]
  source: string
  orig?: string
  langcode?: string
  _dis: string
}

export interface Sense {
  links?: string[][]
  glosses?: string[]
  tags?: string[]
  alt_of?: AltOf[]
  raw_tags?: string[]
  id: string
  categories?: Category2[]
  raw_glosses?: string[]
  form_of?: FormOf[]
  derived?: Derived[]
  head_nr?: number
  related?: Related[]
  wikipedia?: string[]
  examples?: Example[]
  wikidata?: string[]
  senseid?: string[]
  synonyms?: Synonym[]
  qualifier?: string
  topics?: string[]
  antonyms?: Antonym[]
  hyponyms?: Hyponym[]
  coordinate_terms?: CoordinateTerm[]
  meronyms?: Meronym[]
  hypernyms?: Hypernym[]
  holonyms?: Holonym[]
  taxonomic?: string
}

export interface AltOf {
  word: string
  extra?: string
}

export interface Category2 {
  name: string
  kind: string
  parents: string[]
  source: string
  orig?: string
  langcode?: string
  _dis?: string
}

export interface FormOf {
  word: string
  extra?: string
}

export interface Derived {
  roman?: string
  english?: string
  word: string
  alt?: string
  tags?: string[]
  sense?: string
  _dis1?: string
  taxonomic?: string
  ruby?: string[][]
  topics?: string[]
}

export interface Related {
  roman?: string
  word: string
  english?: string
  alt?: string
  tags?: string[]
  sense?: string
  topics?: string[]
  raw_tags?: string[]
  _dis1?: string
  ruby?: string[][]
  taxonomic?: string
}

export interface Example {
  text: string
  english?: string
  type?: string
  roman?: string
  ref?: string
}

export interface Synonym {
  word: string
  roman?: string
  alt?: string
  tags?: string[]
  english?: string
  extra?: string
  sense?: string
  _dis1?: string
  topics?: string[]
  source?: string
  raw_tags?: string[]
  qualifier?: string
}

export interface Antonym {
  word: string
  alt?: string
  english?: string
  tags?: string[]
}

export interface Hyponym {
  roman?: string
  word: string
  english?: string
  source?: string
  tags?: string[]
  alt?: string
}

export interface CoordinateTerm {
  roman?: string
  word: string
  sense?: string
  english?: string
  alt?: string
}

export interface Meronym {
  roman: string
  word: string
  sense?: string
  english?: string
  _dis1?: string
  alt?: string
}

export interface Hypernym {
  roman?: string
  word: string
  english?: string
  alt?: string
  sense?: string
  _dis1?: string
  tags?: string[]
}

export interface Holonym {
  roman: string
  english?: string
  alt?: string
  word: string
  sense?: string
  _dis1?: string
}

export interface HeadTemplate {
  name: string
  args: Args
  expansion: string
}

export interface Args {
  hangeul?: string
  hanja?: string
  "1"?: string
  head?: string
  "2"?: string
  rv?: string
  tr?: string
  "occasional hanja"?: string
  root?: string
  form?: string
  script?: string
  "3"?: string
  "4"?: string
  "5"?: string
  "6"?: string
  irreg?: string
  mr?: string
  y?: string
  hae?: string
  hae2?: string
  count?: string
  rr?: string
  hani?: string
  cat2?: string
  "7"?: string
  "8"?: string
  sc?: string
  sort?: string
  eumhun?: string
  ehrv?: string
  ehmr?: string
  ehy?: string
}

export interface Sound {
  tags?: string[]
  ipa?: string
  note?: string
  other?: string
  hangeul?: string
  audio?: string
  ogg_url?: string
  mp3_url?: string
  homophone?: string
}

export interface EtymologyTemplate {
  name: string
  args: Args2
  expansion: string
}

export interface Args2 {
  "1"?: string
  "2"?: string
  "3"?: string
  "4"?: string
  t1?: string
  t2?: string
  comp?: string
  t3?: string
  pos2?: string
  "5"?: string
  "6"?: string
  alt1?: string
  t4?: string
  compound?: string
  tr1?: string
  id2?: string
  tr?: string
  tr2?: string
  tr3?: string
  alt2?: string
  inf?: string
  suffix?: string
  lit?: string
  "7"?: string
  "8"?: string
  pos3?: string
  t?: string
  id?: string
  year?: string
  yale?: string
  id1?: string
  pos1?: string
  nocat?: string
  pos?: string
  alt3?: string
  pos4?: string
  lang1?: string
  gloss1?: string
  gloss2?: string
  "9"?: string
  "10"?: string
  genitive?: string
  nocap?: string
  sort?: string
  lang2?: string
  lang?: string
  g?: string
  suf?: string
  t5?: string
  t6?: string
  dir?: string
  yanginf?: string
  id3?: string
  dot?: string
  prefix?: string
  tag?: string
  lang3?: string
  lit2?: string
  form?: string
  lit1?: string
  collapsed?: string
  con?: string
  sc?: string
  nodot?: string
  pref?: string
  id4?: string
  pos5?: string
  symbol?: string
  prev1?: string
  trprev1?: string
  prev_qual?: string
  next1?: string
  trnext1?: string
  next_qual?: string
  prev2?: string
  trprev2?: string
  next2?: string
  trnext2?: string
  demo?: string
  hangul?: string
  nohangul?: string
  also?: string
  qq1?: string
  ts?: string
  g2?: string
  g3?: string
  page?: string
  url?: string
  header?: string
  h?: string
  hapax?: string
  quotes?: string
  dk?: string
  m?: string
  mh?: string
  m2?: string
  m2h?: string
  em?: string
  emun?: string
  m3?: string
  m3h?: string
  i?: string
  link?: string
  ml?: string
  jh?: string
  jhh?: string
  alt?: string
  "allow family"?: string
  adj?: string
  pron?: string
  ls?: string
  c1?: string
  c2?: string
  m4?: string
  m4h?: string
  ref?: string
  hun?: string
  gloss?: string
  mul?: string
  in?: string
  nat?: string
  occ?: string
  rom?: string
  linkto?: string
  by?: string
  ko?: string
  w?: string
  notext?: string
  translation?: string
  inline?: string
  pl?: string
  title?: string
  alt4?: string
  alt5?: string
  alt6?: string
  alt7?: string
  alt8?: string
  alt9?: string
  alt10?: string
  t7?: string
  t8?: string
  t9?: string
  t10?: string
  g1?: string
  g4?: string
  g5?: string
  g6?: string
  g7?: string
  g8?: string
  g9?: string
  g10?: string
  tr4?: string
  tr5?: string
  tr6?: string
  tr7?: string
  tr8?: string
  tr9?: string
  tr10?: string
  id5?: string
  id6?: string
  id7?: string
  id8?: string
  id9?: string
  id10?: string
  pos6?: string
  pos7?: string
  pos8?: string
  pos9?: string
  pos10?: string
  lang4?: string
  lang5?: string
  lang6?: string
  lang7?: string
  lang8?: string
  lang9?: string
  lang10?: string
  caps?: string
  note?: string
  c?: string
  PIE?: string
  PIE2?: string
  PII?: string
  PIE1?: string
  PII2?: string
  nodots?: string
  no_och?: string
  "11"?: string
  "12"?: string
  t11?: string
  "13"?: string
  t12?: string
  born?: string
  died?: string
  wplink?: string
  nobycat?: string
}

export interface Derived2 {
  roman?: string
  word: string
  _dis1: string
  alt?: string
  english?: string
  tags?: string[]
  sense?: string
  topics?: string[]
  taxonomic?: string
}

export interface Antonym2 {
  roman?: string
  english?: string
  word: string
  alt?: string
  sense?: string
  tags?: string[]
  topics?: string[]
  ruby?: string[][]
}

export interface Related2 {
  roman?: string
  english?: string
  word: string
  _dis1: string
  alt?: string
  tags?: string[]
  topics?: string[]
  raw_tags?: string[]
  sense?: string
  ruby?: string[][]
}

export interface Synonym2 {
  roman?: string
  word: string
  _dis1: string
  english?: string
  tags?: string[]
  raw_tags?: string[]
  alt?: string
  sense?: string
  topics?: string[]
  source?: string
}

export interface CoordinateTerm2 {
  roman?: string
  word: string
  _dis1: string
  english?: string
  alt?: string
  sense?: string
}

export interface Descendant {
  depth: number
  templates: Template[]
  text: string
}

export interface Template {
  name: string
  args: Args3
  expansion: string
}

export interface Args3 {
  "1": string
  "2"?: string
  bor?: string
  "3"?: string
  unc?: string
  tr?: string
  calq?: string
  cal?: string
  t?: string
  g?: string
  pclq?: string
  "4"?: string
  alts?: string
  tr2?: string
  clq?: string
  sclb?: string
  tr1?: string
  "5"?: string
  qq?: string
  der?: string
  sml?: string
  tr3?: string
  linkto?: string
}

export interface InflectionTemplate {
  name: string
  args: Args4
}

export interface Args4 {
  irreg?: string
  "1"?: string
  stem1?: string
  stem1_r?: string
  stem2?: string
  stem2_r?: string
  stem3?: string
  stem3_r?: string
  hap?: string
  han?: string
  ham?: string
  hal?: string
  haet?: string
  cstem?: string
  stem1a_r?: string
}

export interface Meronym2 {
  sense: string
  roman: string
  word: string
  _dis1: string
}

export interface FormOf2 {
  word: string
}

export interface Proverb {
  roman: string
  word: string
}

export interface Hyponym2 {
  roman: string
  word: string
  _dis1: string
  english?: string
}

export interface Hypernym2 {
  roman: string
  english: string
  word: string
  _dis1: string
}

