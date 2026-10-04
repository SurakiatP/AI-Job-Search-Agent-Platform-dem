import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Header } from '../../components/Header';

export function LandingPage() {
  const { t } = useTranslation();
  const steps = [
    { number: '01', title: 'landingStepCv', titleDefault: 'Add your CV', description: 'landingStepCvDescription', descriptionDefault: 'Keep the original CV and each revision separate from generated documents.' },
    { number: '02', title: 'landingStepJob', titleDefault: 'Evaluate a supplied job', description: 'landingStepJobDescription', descriptionDefault: 'Review evidence-based fit against your CV before deciding what to do next.' },
    { number: '03', title: 'landingStepDrafts', titleDefault: 'Review application drafts', description: 'landingStepDraftsDescription', descriptionDefault: 'Inspect each document and revision; you decide what to edit or submit.' },
  ] as const;
  return <><Header actions={<Link className="button button-primary header-action" to="/app">{t('pages.getStarted', { defaultValue: 'Get started' })}</Link>} /><main className="landing-page"><section className="landing-intro"><p className="eyebrow">{t('pages.landingEyebrow', { defaultValue: 'A clear flow, from CV to reviewed draft.' })}</p><h1 className="landing-headline">{t('pages.landingTitle', { defaultValue: 'Find your next role with clarity' })}</h1><p className="landing-description">{t('pages.landingDescription', { defaultValue: 'Add a CV and a job posting, then review the evaluation and application drafts in one project.' })}</p></section><section className="landing-flow" aria-labelledby="landing-flow-title"><h2 id="landing-flow-title">{t('pages.landingFlowTitle', { defaultValue: 'How it works' })}</h2><ol className="landing-steps">{steps.map(step => <li className="landing-step" key={step.number}><span className="landing-step-number" aria-hidden="true">{step.number}</span><h3>{t(`pages.${step.title}`, { defaultValue: step.titleDefault })}</h3><p>{t(`pages.${step.description}`, { defaultValue: step.descriptionDefault })}</p></li>)}</ol></section><p className="landing-review-note">{t('pages.landingReviewNote', { defaultValue: 'You stay in control: no application is submitted automatically.' })}</p></main></>;
}
