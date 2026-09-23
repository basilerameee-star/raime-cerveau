-- Extrait de la base n8n (production, 2026-09-24) : les cinq tables que lisent les agents. STRUCTURE SEULE.
-- prospects et outreach contiennent en production des personnes réelles : ne JAMAIS y mettre de vraies données en test.

--
-- PostgreSQL database dump
--

\restrict PftAq8Jj8ZvIUZ7WDd8ENgKlXh1jT2574cX1ecQHhgnqi402qmee9DkuwMnL9dD

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: exec_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exec_health (
    agent text NOT NULL,
    total integer,
    errors integer,
    error_rate numeric,
    last_run timestamp with time zone,
    computed_at timestamp with time zone
);


--
-- Name: outreach; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach (
    id bigint NOT NULL,
    siren text,
    prospect_name text,
    segment text,
    to_email text,
    subject text,
    body text,
    status text DEFAULT 'brouillon'::text,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    validated_at timestamp with time zone,
    reply_at timestamp with time zone,
    tenant_id text DEFAULT 'raime'::text NOT NULL
);


--
-- Name: outreach_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outreach_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outreach_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outreach_id_seq OWNED BY public.outreach.id;


--
-- Name: prospects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prospects (
    id bigint NOT NULL,
    siren text,
    name text,
    naf text,
    sector text,
    effectif_label text,
    effectif_est integer,
    departement text,
    city text,
    website text,
    dirigeant text,
    score integer,
    score_reason text,
    status text DEFAULT 'nouveau'::text,
    contact_email text,
    found_at timestamp with time zone DEFAULT now(),
    last_touch timestamp with time zone,
    segment text,
    signaux text,
    tenant_id text DEFAULT 'raime'::text NOT NULL,
    telephone text,
    telephone_source text
);


--
-- Name: prospects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prospects_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prospects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prospects_id_seq OWNED BY public.prospects.id;


--
-- Name: system_learnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_learnings (
    id bigint NOT NULL,
    discovered_at timestamp with time zone DEFAULT now(),
    agent text,
    category text,
    observation text,
    implication text,
    action text,
    resolved boolean DEFAULT false
);


--
-- Name: system_learnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_learnings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_learnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_learnings_id_seq OWNED BY public.system_learnings.id;


--
-- Name: veille_ia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.veille_ia (
    id bigint NOT NULL,
    captured_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    source text,
    title text,
    url text,
    summary text,
    relevance integer,
    sectors text,
    action_hint text
);


--
-- Name: veille_ia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.veille_ia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: veille_ia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.veille_ia_id_seq OWNED BY public.veille_ia.id;


--
-- Name: outreach id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach ALTER COLUMN id SET DEFAULT nextval('public.outreach_id_seq'::regclass);


--
-- Name: prospects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospects ALTER COLUMN id SET DEFAULT nextval('public.prospects_id_seq'::regclass);


--
-- Name: system_learnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_learnings ALTER COLUMN id SET DEFAULT nextval('public.system_learnings_id_seq'::regclass);


--
-- Name: veille_ia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veille_ia ALTER COLUMN id SET DEFAULT nextval('public.veille_ia_id_seq'::regclass);


--
-- Name: exec_health exec_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exec_health
    ADD CONSTRAINT exec_health_pkey PRIMARY KEY (agent);


--
-- Name: outreach outreach_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach
    ADD CONSTRAINT outreach_pkey PRIMARY KEY (id);


--
-- Name: outreach outreach_siren_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach
    ADD CONSTRAINT outreach_siren_key UNIQUE (siren);


--
-- Name: prospects prospects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospects
    ADD CONSTRAINT prospects_pkey PRIMARY KEY (id);


--
-- Name: prospects prospects_siren_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prospects
    ADD CONSTRAINT prospects_siren_key UNIQUE (siren);


--
-- Name: system_learnings system_learnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_learnings
    ADD CONSTRAINT system_learnings_pkey PRIMARY KEY (id);


--
-- Name: veille_ia veille_ia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veille_ia
    ADD CONSTRAINT veille_ia_pkey PRIMARY KEY (id);


--
-- Name: veille_ia veille_ia_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.veille_ia
    ADD CONSTRAINT veille_ia_url_key UNIQUE (url);


--
-- Name: idx_outreach_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_sent ON public.outreach USING btree (sent_at) WHERE (sent_at IS NULL);


--
-- Name: idx_outreach_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_status ON public.outreach USING btree (status);


--
-- Name: idx_prospects_dept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_dept ON public.prospects USING btree (departement);


--
-- Name: idx_prospects_enrich; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_enrich ON public.prospects USING btree (departement, score DESC) WHERE ((contact_email IS NULL) AND (website IS NULL));


--
-- Name: idx_prospects_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_score ON public.prospects USING btree (score DESC, found_at DESC);


--
-- Name: idx_prospects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prospects_status ON public.prospects USING btree (status);


--
-- Name: idx_veille_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_veille_published ON public.veille_ia USING btree (published_at DESC);


--
-- Name: idx_veille_relevance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_veille_relevance ON public.veille_ia USING btree (relevance DESC, published_at DESC);


--
-- Name: outreach; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outreach ENABLE ROW LEVEL SECURITY;

--
-- Name: prospects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

--
-- Name: outreach tenant_iso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_iso ON public.outreach USING ((tenant_id = current_setting('app.tenant_id'::text, true)));


--
-- Name: prospects tenant_iso; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_iso ON public.prospects USING ((tenant_id = current_setting('app.tenant_id'::text, true)));


--
-- PostgreSQL database dump complete
--

\unrestrict PftAq8Jj8ZvIUZ7WDd8ENgKlXh1jT2574cX1ecQHhgnqi402qmee9DkuwMnL9dD

