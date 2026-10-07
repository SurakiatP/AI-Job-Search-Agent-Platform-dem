"""Deterministic CV-to-job skill coverage (FR-J03); no model involved, separate from the AI fit score."""
from __future__ import annotations

import re

METHOD = "keyword_dictionary_v1"
MAX_ITEMS = 60  # mirrors SkillCoverage list bounds in contracts.py

# "Canonical = alias, alias". The canonical name is always an alias. ASCII aliases match on
# alphanumeric boundaries, case-insensitively; non-ASCII (Thai) aliases match as substrings.
# Ambiguous short words (go, r, c, ai, ml, sap-as-word) are deliberately only reachable via
# unambiguous aliases such as "golang" or "c programming".
_DICTIONARY = """
React = reactjs, react.js, รีแอคท์
Next.js = nextjs, next js
Vue = vuejs, vue.js, vue 3, nuxt, nuxt.js
Angular = angularjs, angular.js
Svelte = sveltekit
TypeScript =
JavaScript = ecmascript, es6, javascript, จาวาสคริปต์
Node.js = nodejs, node js, express.js, expressjs
NestJS = nest.js
HTML = html5
CSS = css3, scss, sass
Tailwind = tailwindcss, tailwind css
Bootstrap =
jQuery =
Redux = redux toolkit, zustand
Webpack = vite
React Native = react-native
Flutter = dart
Swift = swiftui
Kotlin =
Android = android studio
iOS = xcode
Java = core java, จาวา
Spring = spring boot, springboot
Python = python3, ไพทอน, ไพธอน
Django =
Flask =
FastAPI =
Go = golang, go lang, go developer, go engineer
Rust = rust lang
PHP = พีเอชพี
Laravel =
Ruby = ruby on rails
C# = c sharp, csharp
C++ = cpp
C = c programming, c language
.NET = dotnet, asp.net, .net core
R = r programming, r language
Scala =
Elixir =
SQL = ภาษา sql, t-sql, pl/sql
PostgreSQL = postgres, psql
MySQL = mariadb
SQL Server = mssql, ms sql, microsoft sql server
Oracle = oracle database, oracle db
MongoDB = mongo
Redis =
Elasticsearch = elastic search, opensearch
Firebase = firestore
NoSQL = dynamodb, cassandra
Supabase =
GraphQL = graph ql, apollo graphql
REST API = restful, restful api, rest apis, rest-api, web api
gRPC = grpc
Microservices = micro services, microservice
WebSocket = websockets
AWS = amazon web services, ec2, s3, aws lambda
Azure = microsoft azure
Google Cloud = gcp, google cloud platform, bigquery
Docker = docker compose, dockerfile, คอนเทนเนอร์
Kubernetes = k8s, helm chart
Terraform = infrastructure as code, iac
Ansible =
Linux = ubuntu, bash, shell script
Nginx =
CI/CD = ci cd, cicd, github actions, gitlab ci, jenkins
Git = github, gitlab, bitbucket
DevOps = devsecops, sre
Jest = jest.js
Vitest =
Playwright =
Cypress =
Selenium =
Unit Testing = unit test, tdd, junit, pytest
QA = quality assurance, test automation, software testing, เทสต์ซอฟต์แวร์
Postman =
Machine Learning = deep learning, แมชชีนเลิร์นนิง, การเรียนรู้ของเครื่อง
Data Science = data scientist, วิทยาการข้อมูล
Data Analysis = data analytics, data analyst, วิเคราะห์ข้อมูล, การวิเคราะห์ข้อมูล
Data Engineering = data engineer, etl, data pipeline, airflow, dbt
Big Data = apache spark, pyspark, hadoop, kafka
Pandas = numpy
TensorFlow = pytorch, keras, scikit-learn
NLP = natural language processing
LLM = large language model, generative ai, genai, prompt engineering, langchain
Computer Vision = opencv
Power BI = powerbi, power-bi
Tableau =
Looker = looker studio, data studio
Excel = microsoft excel, ms excel, vlookup, pivot table, เอ็กเซล, เอกเซล
Google Sheets = google spreadsheet
PowerPoint = ms powerpoint, microsoft powerpoint, พาวเวอร์พอยต์
Microsoft Office = ms office, office 365, microsoft 365, microsoft word
Google Analytics = ga4, google tag manager, gtm
Figma = ฟิกม่า
Sketch = adobe xd
Photoshop = adobe photoshop
Illustrator = adobe illustrator
Premiere Pro = adobe premiere, after effects, video editing, ตัดต่อวิดีโอ
Canva = แคนวา
UX Design = ux, user experience, ux research, user research
UI Design = ui, user interface, ui/ux, ออกแบบ ui
Wireframing = wireframe, prototyping, prototype
Design System = design systems, storybook
Accessibility = wcag, a11y
Responsive Design = responsive web, mobile first
Agile = ระบบ agile, agile methodology
Scrum = scrum master, สครัม
Kanban =
Jira = confluence, trello, asana
Notion =
Slack =
Project Management = project manager, pmp, prince2, การบริหารโครงการ, บริหารโครงการ, ผู้จัดการโครงการ
Product Management = product manager, product owner, product roadmap, บริหารผลิตภัณฑ์
Business Analysis = business analyst, requirements gathering, brd, วิเคราะห์ธุรกิจ
Stakeholder Management = stakeholder, stakeholders
OKR = kpi, kpis, okrs
Presentation = presentation skills, public speaking, การนำเสนอ
Communication = communication skills, การสื่อสาร, ทักษะการสื่อสาร
Teamwork = team work, collaboration, การทำงานเป็นทีม, ทำงานเป็นทีม
Leadership = team lead, team leader, ภาวะผู้นำ, ผู้นำทีม
Problem Solving = problem-solving, การแก้ปัญหา, แก้ปัญหา
Time Management = การบริหารเวลา, บริหารเวลา
Negotiation = การเจรจา, เจรจาต่อรอง
Mentoring = coaching, code review
SEO = search engine optimization, seo/sem
SEM = google ads, adwords, ppc
Facebook Ads = meta ads, facebook advertising, tiktok ads, line ads
Digital Marketing = online marketing, performance marketing, การตลาดดิจิทัล, การตลาดออนไลน์
Social Media = social media marketing, community management, โซเชียลมีเดีย
Content Marketing = content creation, content strategy, คอนเทนต์
Copywriting = copywriter, content writing, เขียนคอนเทนต์
Email Marketing = mailchimp, edm
Marketing = brand management, การตลาด
Branding = brand strategy, แบรนด์ดิ้ง
Market Research = การวิจัยตลาด, วิจัยตลาด
CRM = salesforce, hubspot, zoho, dynamics 365
Sales = b2b sales, b2c, business development, การขาย
Account Management = key account, account manager
Customer Service = customer support, customer success, บริการลูกค้า, ดูแลลูกค้า
E-commerce = ecommerce, shopee, lazada, shopify, woocommerce, อีคอมเมิร์ซ
Supply Chain = logistics, procurement, inventory, โลจิสติกส์, จัดซื้อ
ERP = sap, odoo, netsuite, oracle erp
Accounting = bookkeeping, general ledger, ภาษีอากร, บัญชี, การบัญชี
Financial Analysis = financial modeling, financial modelling, valuation, การวิเคราะห์การเงิน
Budgeting = forecasting, financial planning, งบประมาณ
Auditing = internal audit, audit, ตรวจสอบบัญชี
Tax = taxation, ภาษี
QuickBooks = peachtree, express accounting, flowaccount
Risk Management = compliance, risk assessment, บริหารความเสี่ยง
Banking = fintech, การเงินการธนาคาร
HR = human resources, talent acquisition, recruitment, recruiter, ทรัพยากรบุคคล, สรรหาบุคลากร
Payroll = compensation and benefits, c&b, เงินเดือน
Training & Development = learning and development, l&d, employee training, การฝึกอบรม, ฝึกอบรม
Lean Six Sigma = six sigma, kaizen, lean manufacturing, continuous improvement
Quality Management = iso 9001, iso9001, iso 27001, qms, tqm
Cybersecurity = information security, infosec, penetration testing, owasp, ความปลอดภัยไซเบอร์
Computer Networking = tcp/ip, cisco, ccna, vpn, network engineer
IT Support = help desk, helpdesk, service desk, troubleshooting
System Administration = sysadmin, windows server, active directory
Embedded Systems = firmware, arduino, raspberry pi, iot
AutoCAD = solidworks, revit, cad
PLC = scada, plc programming
Blockchain = web3, solidity, smart contract
Game Development = unity 3d, unity3d, unreal engine, game developer
SaaS = b2b saas
Mobile Development = mobile app, mobile developer, พัฒนาแอป
Frontend = front-end, front end, ฟรอนต์เอนด์
Backend = back-end, back end, แบ็กเอนด์
Full Stack = fullstack, full-stack
Software Architecture = system design, design patterns, solution architecture, clean architecture
Algorithms = data structures, โครงสร้างข้อมูล
OOP = object-oriented, object oriented, oop
Performance Optimization = performance tuning, load testing, jmeter
Observability = monitoring tools, grafana, prometheus, datadog
English = ภาษาอังกฤษ, toeic, ielts, toefl
Thai = thai language, ภาษาไทย
Chinese = mandarin, ภาษาจีน, hsk
Japanese = jlpt, ภาษาญี่ปุ่น
Korean = topik, ภาษาเกาหลี
"""


# Names that are also everyday words/letters: only their explicit aliases count ("Spring" != "spring 2025").
_NOT_SELF_ALIAS = {"Go", "R", "C", "Spring", "Lean Six Sigma"}


def _build() -> tuple[tuple[str, re.Pattern[str] | None, tuple[str, ...]], ...]:
    entries = []
    for line in _DICTIONARY.strip().splitlines():
        name, _, rest = line.partition("=")
        name = name.strip()
        aliases = {*(a.strip().lower() for a in rest.split(",") if a.strip())}
        if name not in _NOT_SELF_ALIAS:
            aliases.add(name.lower())
        ascii_aliases = sorted((a for a in aliases if a.isascii()), key=len, reverse=True)
        thai_aliases = tuple(sorted(a for a in aliases if not a.isascii()))
        pattern = None
        if ascii_aliases:
            body = "|".join(re.escape(a) for a in ascii_aliases)
            pattern = re.compile(rf"(?<![a-z0-9])(?:{body})(?![a-z0-9])")
        entries.append((name, pattern, thai_aliases))
    return tuple(entries)


_ENTRIES = _build()
DICTIONARY_SIZE = len(_ENTRIES)


def _first_position(entry: tuple[str, re.Pattern[str] | None, tuple[str, ...]], text: str) -> int | None:
    _, pattern, thai = entry
    found = []
    if pattern is not None and (match := pattern.search(text)):
        found.append(match.start())
    found.extend(pos for alias in thai if (pos := text.find(alias)) >= 0)
    return min(found) if found else None


def compute_skill_coverage(cv_text: str, job_text: str) -> dict | None:
    """Return required/matched/missing skills by dictionary lookup, or None when the job names fewer than two."""
    job, cv = job_text.lower(), cv_text.lower()
    required = sorted(
        ((pos, entry[0], entry) for entry in _ENTRIES if (pos := _first_position(entry, job)) is not None),
        key=lambda item: (item[0], item[1]),
    )
    if len(required) < 2:
        return None
    names = [name for _, name, _ in required]
    matched = [name for _, name, entry in required if _first_position(entry, cv) is not None]
    missing = [name for name in names if name not in matched]
    return {
        "required": names[:MAX_ITEMS],
        "matched": matched[:MAX_ITEMS],
        "missing": missing[:MAX_ITEMS],
        "ratio": round(len(matched) / len(names), 2),
        "method": METHOD,
    }
