# Deployment And Rollout TODO

## Fast Track Reference

- Use the focused pre-deploy list in todo/render_predeploy_checklist.md before pushing to Render.

## Phase 1: Finish UI And Design Pass

- Apply the agreed design improvements across the main tester-facing pages.
- Check desktop and mobile layouts for the most-used screens.
- Review navigation labels, grouping, and consistency after recent menu changes.
- Check forms, tables, and buttons for consistent spacing and alignment.
- Do a quick accessibility pass for contrast, headings, labels, and keyboard use.

## Phase 2: Pre-Deploy QA

- Retest staff CSV upload flow.
- Retest student upload flow.
- Retest timetable upload flow.
- Retest department upload flow.
- Retest user roles flow for both staff and students.
- Retest permissions matrix and confirm role changes save and reset correctly.
- Check staff profile lookup from User Role Management.
- Check student profile and timetable lookup from User Role Management.
- Confirm navigation still works after the recent menu restructuring.

## Phase 3: Render Deployment

- Prepare Render environment variables.
- Confirm database connection settings work in Render.
- Check static file serving and public page paths after deployment.
- Run a clean deploy to Render.
- Verify core pages load correctly on the hosted version.
- Verify API routes work correctly on the hosted version.
- Confirm uploads and database writes work in the hosted environment.

## Phase 4: Post-Deploy Validation

- Test login or user identity flow if used in production.
- Recheck role permissions on the hosted version.
- Recheck CSV upload flows on the hosted version.
- Recheck user role assignment and profile lookup on the hosted version.
- Recheck student and staff separation in additional roles.
- Recheck responsive behavior on hosted pages.

## Phase 5: Google Components

- Define which Google components are needed first.
- Confirm the authentication or account model required for Google integration.
- Set up Google API credentials and callback URLs.
- Add Google components one at a time and validate each one.
- Test Google integrations in the deployed environment.

## Phase 6: Tester Readiness

- Create a short tester checklist for the main workflows.
- Identify the tester group and their expected user roles.
- Prepare test accounts or sample data if needed.
- Confirm the hosted version is stable enough for external use.
- Run a final sanity check before sharing the link.

## Priority Checks Before Term 2 Testing

- End-to-end role testing for staff and students.
- CSV upload retest for staff, department, timetable, and students.
- Permission matrix sanity check after clean deployment.
- Render environment and database connection verification.
- Mobile and responsive check on the main tester-facing pages.
