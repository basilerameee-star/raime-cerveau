-- Structure de la base raime_brain (production, relevée le 2026-09-24). STRUCTURE SEULE : aucune donnée.
-- Sert au banc d'essai hors ligne : createdb puis psql -f db/schema_raime_brain.sql

--
-- PostgreSQL database dump
--

\restrict tJweq0Ofjb2mhCcPAGgwwisAAmj9kAee0sjYd2p6UykkUCKHaqPpytm84FXk4z9

-- Dumped from database version 16.15 (Debian 16.15-1.pgdg13+2)
-- Dumped by pg_dump version 16.15 (Debian 16.15-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent text NOT NULL,
    task text,
    model text,
    prompt_version text,
    ref uuid,
    tokens_in integer,
    tokens_out integer,
    cost_usd numeric,
    duration_ms integer,
    status text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_criteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_criteria (
    id integer NOT NULL,
    rank integer,
    code text,
    label text,
    description text,
    checks jsonb DEFAULT '[]'::jsonb
);


--
-- Name: audit_criteria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_criteria_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_criteria_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_criteria_id_seq OWNED BY public.audit_criteria.id;


--
-- Name: audit_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_questions (
    id integer NOT NULL,
    rank integer,
    question text,
    method text,
    criterion text
);


--
-- Name: audit_questions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_questions_id_seq OWNED BY public.audit_questions.id;


--
-- Name: audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    proposal_id uuid,
    scores jsonb DEFAULT '{}'::jsonb,
    findings jsonb DEFAULT '[]'::jsonb,
    recommendation text,
    cost_model jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: buts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buts (
    id bigint NOT NULL,
    horizon text NOT NULL,
    enonce text NOT NULL,
    mesure text,
    cible text,
    etat text DEFAULT 'ouvert'::text NOT NULL,
    parent_id bigint,
    cree_le timestamp with time zone DEFAULT now() NOT NULL,
    clos_le timestamp with time zone,
    CONSTRAINT buts_etat_check CHECK ((etat = ANY (ARRAY['ouvert'::text, 'atteint'::text, 'abandonne'::text]))),
    CONSTRAINT buts_horizon_check CHECK ((horizon = ANY (ARRAY['long'::text, 'moyen'::text, 'court'::text])))
);


--
-- Name: buts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.buts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: buts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.buts_id_seq OWNED BY public.buts.id;


--
-- Name: candidats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidats (
    id bigint NOT NULL,
    domaine text NOT NULL,
    identifiant text NOT NULL,
    titre text,
    source text,
    donnees jsonb DEFAULT '{}'::jsonb NOT NULL,
    nature text,
    verdict text,
    motif text,
    mesure jsonb,
    vu_le timestamp with time zone DEFAULT now() NOT NULL,
    tranche_le timestamp with time zone,
    CONSTRAINT candidats_nature_check CHECK ((nature = ANY (ARRAY['fait'::text, 'jugement'::text, 'hors_perimetre'::text]))),
    CONSTRAINT candidats_verdict_check CHECK ((verdict = ANY (ARRAY['applique'::text, 'promu'::text, 'refuse'::text, 'non_evaluable'::text, 'en_attente'::text])))
);


--
-- Name: candidats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.candidats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: candidats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.candidats_id_seq OWNED BY public.candidats.id;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    sector text,
    size text,
    profile jsonb DEFAULT '{}'::jsonb,
    dynamic jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: croyances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.croyances (
    sujet text NOT NULL,
    enonce text NOT NULL,
    confiance numeric DEFAULT 0.5 NOT NULL,
    source text,
    maj_le timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT croyances_confiance_check CHECK (((confiance >= (0)::numeric) AND (confiance <= (1)::numeric)))
);


--
-- Name: demandes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.demandes (
    id bigint NOT NULL,
    question text NOT NULL,
    pourquoi text,
    bloquant boolean DEFAULT false NOT NULL,
    etat text DEFAULT 'ouverte'::text NOT NULL,
    reponse text,
    cycle_id text,
    cree_le timestamp with time zone DEFAULT now() NOT NULL,
    close_le timestamp with time zone,
    CONSTRAINT demandes_etat_check CHECK ((etat = ANY (ARRAY['ouverte'::text, 'repondue'::text, 'abandonnee'::text])))
);


--
-- Name: demandes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.demandes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: demandes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.demandes_id_seq OWNED BY public.demandes.id;


--
-- Name: enrichissement_suivi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichissement_suivi (
    siren text NOT NULL,
    email_vu_le timestamp with time zone DEFAULT now() NOT NULL,
    origine text DEFAULT 'observe'::text NOT NULL
);


--
-- Name: etats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etats (
    id bigint NOT NULL,
    but_id bigint,
    action text NOT NULL,
    arguments jsonb DEFAULT '{}'::jsonb NOT NULL,
    attendu text,
    probabilite_echec numeric,
    detection text,
    resultat text,
    ecart text,
    cause text,
    correction text,
    lecon text,
    cout_usd numeric DEFAULT 0,
    duree_ms integer,
    cree_le timestamp with time zone DEFAULT now() NOT NULL,
    type text,
    cycle_id text,
    rang integer,
    CONSTRAINT etats_probabilite_echec_check CHECK (((probabilite_echec >= (0)::numeric) AND (probabilite_echec <= (1)::numeric))),
    CONSTRAINT etats_type_check CHECK ((type = ANY (ARRAY['PROPOSER'::text, 'DEMANDER_INFOS'::text, 'EXECUTER'::text, 'EVALUER'::text, 'CORRIGER'::text, 'MEMORISER'::text, 'METAFLECHIR'::text])))
);


--
-- Name: etats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.etats_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.etats_id_seq OWNED BY public.etats.id;


--
-- Name: idees_offres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.idees_offres (
    id bigint NOT NULL,
    titre text NOT NULL,
    promesse text,
    ancrage text,
    famille text,
    cree_le timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: idees_offres_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.idees_offres_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: idees_offres_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.idees_offres_id_seq OWNED BY public.idees_offres.id;


--
-- Name: journal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    acteur text,
    changement text NOT NULL,
    motif text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: kb_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_chunks (
    id bigint NOT NULL,
    source text NOT NULL,
    titre text,
    domaine text DEFAULT 'general'::text,
    rang integer NOT NULL,
    texte text NOT NULL,
    mots tsvector GENERATED ALWAYS AS (to_tsvector('french'::regconfig, texte)) STORED,
    empreinte text NOT NULL,
    ajoute_le timestamp with time zone DEFAULT now() NOT NULL,
    mots_titre tsvector GENERATED ALWAYS AS (to_tsvector('french'::regconfig, ((COALESCE(titre, ''::text) || ' '::text) || regexp_replace(COALESCE(source, ''::text), '[/_.-]+'::text, ' '::text, 'g'::text)))) STORED
);


--
-- Name: kb_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.kb_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: kb_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.kb_chunks_id_seq OWNED BY public.kb_chunks.id;


--
-- Name: kb_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kb_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    path text,
    title text,
    tags text[],
    body text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: limites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.limites (
    sujet text NOT NULL,
    enonce text NOT NULL,
    origine text,
    maj_le timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: metrologie; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metrologie (
    id bigint NOT NULL,
    modele text NOT NULL,
    tache text NOT NULL,
    famille text NOT NULL,
    note integer,
    tokens_in integer,
    tokens_out integer,
    cout_usd numeric,
    duree_ms integer,
    sortie text,
    releve_le timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: metrologie_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.metrologie_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: metrologie_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.metrologie_id_seq OWNED BY public.metrologie.id;


--
-- Name: model_prices_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_prices_history (
    id bigint NOT NULL,
    openrouter_id text NOT NULL,
    price_in numeric,
    price_out numeric,
    context_tokens bigint,
    releve_le date DEFAULT CURRENT_DATE NOT NULL
);


--
-- Name: model_prices_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.model_prices_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: model_prices_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.model_prices_history_id_seq OWNED BY public.model_prices_history.id;


--
-- Name: models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    name text NOT NULL,
    openrouter_id text,
    context_tokens integer,
    price_in numeric,
    price_out numeric,
    modality text[] DEFAULT '{text}'::text[],
    strengths jsonb DEFAULT '{}'::jsonb,
    params jsonb DEFAULT '{}'::jsonb,
    deterministic_friendly boolean,
    source text DEFAULT 'manual'::text,
    verify boolean DEFAULT true,
    as_of date,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: prompt_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_evaluations (
    id bigint NOT NULL,
    agent text NOT NULL,
    version integer NOT NULL,
    executions integer NOT NULL,
    mesure jsonb NOT NULL,
    verdict text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT prompt_evaluations_verdict_check CHECK ((verdict = ANY (ARRAY['conserver'::text, 'annuler'::text, 'en_cours'::text])))
);


--
-- Name: prompt_evaluations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prompt_evaluations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prompt_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prompt_evaluations_id_seq OWNED BY public.prompt_evaluations.id;


--
-- Name: prompt_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prompt_versions (
    id bigint NOT NULL,
    agent text NOT NULL,
    version integer NOT NULL,
    active boolean DEFAULT false NOT NULL,
    instruction text NOT NULL,
    motif text,
    critere_succes text,
    seuil_retour text,
    propose_par text DEFAULT 'reflexif'::text NOT NULL,
    active_par text,
    active_le timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: prompt_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prompt_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prompt_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prompt_versions_id_seq OWNED BY public.prompt_versions.id;


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    vendor text,
    raw text,
    parsed jsonb DEFAULT '{}'::jsonb,
    received_at timestamp with time zone DEFAULT now()
);


--
-- Name: prospective; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospective (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lecture text,
    projections jsonb,
    adaptations jsonb,
    faits jsonb,
    modele text,
    cout_usd numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: radar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text,
    source text,
    title text,
    payload jsonb,
    seen_at timestamp with time zone DEFAULT now()
);


--
-- Name: releves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.releves (
    id bigint NOT NULL,
    mesures jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: releves_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.releves_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: releves_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.releves_id_seq OWNED BY public.releves.id;


--
-- Name: sector_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector_automations (
    id integer NOT NULL,
    secteur text NOT NULL,
    processus text NOT NULL,
    automatisation text,
    niveau_ia text,
    approche_sobre text,
    approche_survendue text,
    piege text,
    gain_type text,
    complexite text
);


--
-- Name: sector_automations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sector_automations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sector_automations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sector_automations_id_seq OWNED BY public.sector_automations.id;


--
-- Name: sector_playbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector_playbooks (
    id integer NOT NULL,
    secteur text NOT NULL,
    priorite integer,
    contexte text,
    volumetrie text,
    reglementation text[],
    maturite_ia text,
    pression_ia text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: sector_playbooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sector_playbooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sector_playbooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sector_playbooks_id_seq OWNED BY public.sector_playbooks.id;


--
-- Name: supervision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervision (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    etat text,
    resume text,
    faits jsonb,
    anomalies jsonb,
    decisions jsonb,
    modele text,
    cout_usd numeric,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: veille; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veille (
    id bigint NOT NULL,
    source text NOT NULL,
    titre text NOT NULL,
    lien text NOT NULL,
    detail text,
    score integer NOT NULL,
    vu_le timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: veille_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veille_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veille_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veille_id_seq OWNED BY public.veille.id;


--
-- Name: audit_criteria id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_criteria ALTER COLUMN id SET DEFAULT nextval('public.audit_criteria_id_seq'::regclass);


--
-- Name: audit_questions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_questions ALTER COLUMN id SET DEFAULT nextval('public.audit_questions_id_seq'::regclass);


--
-- Name: buts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buts ALTER COLUMN id SET DEFAULT nextval('public.buts_id_seq'::regclass);


--
-- Name: candidats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidats ALTER COLUMN id SET DEFAULT nextval('public.candidats_id_seq'::regclass);


--
-- Name: demandes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandes ALTER COLUMN id SET DEFAULT nextval('public.demandes_id_seq'::regclass);


--
-- Name: etats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etats ALTER COLUMN id SET DEFAULT nextval('public.etats_id_seq'::regclass);


--
-- Name: idees_offres id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idees_offres ALTER COLUMN id SET DEFAULT nextval('public.idees_offres_id_seq'::regclass);


--
-- Name: kb_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks ALTER COLUMN id SET DEFAULT nextval('public.kb_chunks_id_seq'::regclass);


--
-- Name: metrologie id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metrologie ALTER COLUMN id SET DEFAULT nextval('public.metrologie_id_seq'::regclass);


--
-- Name: model_prices_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_prices_history ALTER COLUMN id SET DEFAULT nextval('public.model_prices_history_id_seq'::regclass);


--
-- Name: prompt_evaluations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_evaluations ALTER COLUMN id SET DEFAULT nextval('public.prompt_evaluations_id_seq'::regclass);


--
-- Name: prompt_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions ALTER COLUMN id SET DEFAULT nextval('public.prompt_versions_id_seq'::regclass);


--
-- Name: releves id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releves ALTER COLUMN id SET DEFAULT nextval('public.releves_id_seq'::regclass);


--
-- Name: sector_automations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_automations ALTER COLUMN id SET DEFAULT nextval('public.sector_automations_id_seq'::regclass);


--
-- Name: sector_playbooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_playbooks ALTER COLUMN id SET DEFAULT nextval('public.sector_playbooks_id_seq'::regclass);


--
-- Name: veille id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veille ALTER COLUMN id SET DEFAULT nextval('public.veille_id_seq'::regclass);


--
-- Name: agent_runs agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_runs
    ADD CONSTRAINT agent_runs_pkey PRIMARY KEY (id);


--
-- Name: audit_criteria audit_criteria_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_criteria
    ADD CONSTRAINT audit_criteria_code_key UNIQUE (code);


--
-- Name: audit_criteria audit_criteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_criteria
    ADD CONSTRAINT audit_criteria_pkey PRIMARY KEY (id);


--
-- Name: audit_questions audit_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_questions
    ADD CONSTRAINT audit_questions_pkey PRIMARY KEY (id);


--
-- Name: audits audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT audits_pkey PRIMARY KEY (id);


--
-- Name: buts buts_enonce_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buts
    ADD CONSTRAINT buts_enonce_key UNIQUE (enonce);


--
-- Name: buts buts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buts
    ADD CONSTRAINT buts_pkey PRIMARY KEY (id);


--
-- Name: candidats candidats_domaine_identifiant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidats
    ADD CONSTRAINT candidats_domaine_identifiant_key UNIQUE (domaine, identifiant);


--
-- Name: candidats candidats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidats
    ADD CONSTRAINT candidats_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: croyances croyances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.croyances
    ADD CONSTRAINT croyances_pkey PRIMARY KEY (sujet);


--
-- Name: demandes demandes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandes
    ADD CONSTRAINT demandes_pkey PRIMARY KEY (id);


--
-- Name: demandes demandes_question_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.demandes
    ADD CONSTRAINT demandes_question_key UNIQUE (question);


--
-- Name: enrichissement_suivi enrichissement_suivi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichissement_suivi
    ADD CONSTRAINT enrichissement_suivi_pkey PRIMARY KEY (siren);


--
-- Name: etats etats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etats
    ADD CONSTRAINT etats_pkey PRIMARY KEY (id);


--
-- Name: idees_offres idees_offres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.idees_offres
    ADD CONSTRAINT idees_offres_pkey PRIMARY KEY (id);


--
-- Name: journal journal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal
    ADD CONSTRAINT journal_pkey PRIMARY KEY (id);


--
-- Name: kb_chunks kb_chunks_empreinte_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT kb_chunks_empreinte_key UNIQUE (empreinte);


--
-- Name: kb_chunks kb_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_chunks
    ADD CONSTRAINT kb_chunks_pkey PRIMARY KEY (id);


--
-- Name: kb_documents kb_documents_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT kb_documents_path_key UNIQUE (path);


--
-- Name: kb_documents kb_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kb_documents
    ADD CONSTRAINT kb_documents_pkey PRIMARY KEY (id);


--
-- Name: limites limites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.limites
    ADD CONSTRAINT limites_pkey PRIMARY KEY (sujet);


--
-- Name: metrologie metrologie_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metrologie
    ADD CONSTRAINT metrologie_pkey PRIMARY KEY (id);


--
-- Name: model_prices_history model_prices_history_openrouter_id_releve_le_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_prices_history
    ADD CONSTRAINT model_prices_history_openrouter_id_releve_le_key UNIQUE (openrouter_id, releve_le);


--
-- Name: model_prices_history model_prices_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_prices_history
    ADD CONSTRAINT model_prices_history_pkey PRIMARY KEY (id);


--
-- Name: models models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_pkey PRIMARY KEY (id);


--
-- Name: models models_provider_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_provider_name_key UNIQUE (provider, name);


--
-- Name: prompt_evaluations prompt_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_evaluations
    ADD CONSTRAINT prompt_evaluations_pkey PRIMARY KEY (id);


--
-- Name: prompt_versions prompt_versions_agent_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_agent_version_key UNIQUE (agent, version);


--
-- Name: prompt_versions prompt_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prompt_versions
    ADD CONSTRAINT prompt_versions_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: prospective prospective_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospective
    ADD CONSTRAINT prospective_pkey PRIMARY KEY (id);


--
-- Name: radar_events radar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radar_events
    ADD CONSTRAINT radar_events_pkey PRIMARY KEY (id);


--
-- Name: releves releves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.releves
    ADD CONSTRAINT releves_pkey PRIMARY KEY (id);


--
-- Name: sector_automations sector_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_automations
    ADD CONSTRAINT sector_automations_pkey PRIMARY KEY (id);


--
-- Name: sector_automations sector_automations_secteur_processus_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_automations
    ADD CONSTRAINT sector_automations_secteur_processus_key UNIQUE (secteur, processus);


--
-- Name: sector_playbooks sector_playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_playbooks
    ADD CONSTRAINT sector_playbooks_pkey PRIMARY KEY (id);


--
-- Name: sector_playbooks sector_playbooks_secteur_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_playbooks
    ADD CONSTRAINT sector_playbooks_secteur_key UNIQUE (secteur);


--
-- Name: supervision supervision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervision
    ADD CONSTRAINT supervision_pkey PRIMARY KEY (id);


--
-- Name: veille veille_lien_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veille
    ADD CONSTRAINT veille_lien_key UNIQUE (lien);


--
-- Name: veille veille_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veille
    ADD CONSTRAINT veille_pkey PRIMARY KEY (id);


--
-- Name: agent_runs_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX agent_runs_agent_idx ON public.agent_runs USING btree (agent, created_at DESC);


--
-- Name: etats_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etats_cycle ON public.etats USING btree (cycle_id, rang);


--
-- Name: etats_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etats_date ON public.etats USING btree (cree_le DESC);


--
-- Name: journal_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX journal_date_idx ON public.journal USING btree (created_at DESC);


--
-- Name: kb_chunks_mots; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_mots ON public.kb_chunks USING gin (mots);


--
-- Name: kb_chunks_mots_titre; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_mots_titre ON public.kb_chunks USING gin (mots_titre);


--
-- Name: kb_chunks_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX kb_chunks_source ON public.kb_chunks USING btree (source, rang);


--
-- Name: metro_modele_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX metro_modele_date ON public.metrologie USING btree (modele, releve_le DESC);


--
-- Name: mph_modele_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mph_modele_date ON public.model_prices_history USING btree (openrouter_id, releve_le DESC);


--
-- Name: prompt_versions_un_seul_actif; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX prompt_versions_un_seul_actif ON public.prompt_versions USING btree (agent) WHERE active;


--
-- Name: supervision_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supervision_date_idx ON public.supervision USING btree (created_at DESC);


--
-- Name: veille_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX veille_date ON public.veille USING btree (vu_le DESC);


--
-- Name: audit_questions audit_questions_criterion_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_questions
    ADD CONSTRAINT audit_questions_criterion_fkey FOREIGN KEY (criterion) REFERENCES public.audit_criteria(code);


--
-- Name: audits audits_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT audits_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: audits audits_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audits
    ADD CONSTRAINT audits_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id);


--
-- Name: buts buts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buts
    ADD CONSTRAINT buts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.buts(id) ON DELETE SET NULL;


--
-- Name: etats etats_but_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etats
    ADD CONSTRAINT etats_but_id_fkey FOREIGN KEY (but_id) REFERENCES public.buts(id) ON DELETE SET NULL;


--
-- Name: proposals proposals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict tJweq0Ofjb2mhCcPAGgwwisAAmj9kAee0sjYd2p6UykkUCKHaqPpytm84FXk4z9

