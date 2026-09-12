# Install the Atelier Liquid Glass update

This update applies the approved glass design to the real flashcard application.
It is ready for the existing Flashcard-testing GitHub Pages site. No build,
package installation, database migration, or new account is needed.

## Upload to your existing website

1. Right-click `tomato08-liquid-glass-update.zip` in Windows and choose **Extract All**.
2. Open [your repository](https://github.com/Almighty1564/Flashcard-testing).
   Use the branch and folder that already publish your site. If unsure, check
   **Settings → Pages → Build and deployment**; retain the current configuration.
3. In the folder containing the existing `index.html`, choose **Add file → Upload files**.
4. Open the extracted folder, select **all the files inside it**, and drag those
   files into GitHub's upload area. All files in this update are at one level.
   Do not upload the ZIP itself or place the files inside another website folder.
5. Confirm `index.html`, `tester.html`, `liquid-glass.css`, `liquid-glass-inner.css`,
   `liquid-glass.js`, and `atelier.png` appear at the same level. Existing files
   with matching names will be updated. Leave unrelated repository files in place.
6. Enter a commit message such as **Apply Atelier Liquid Glass theme** and commit
   to the existing publishing branch. If you choose a separate branch, merge its
   pull request into the publishing branch when you are ready to release.
7. In **Actions**, wait for the Pages deployment to succeed. Then open
   [your website](https://www.tomato08.com/) and press **Ctrl+Shift+R** to reload.

These steps publish the new look publicly when your publishing branch updates.
Nothing has been pushed or published by this task.

GitHub's official instructions: [upload files](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
and [Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## What the update contains

- The seven application pages, connected to the existing learning and account code.
- The supporting frontend styles/controllers and new appearance controls.
- The existing weather/news/sports briefing, including Fayetteville, NC as the default location.
- `atelier.png` at the top level. Both entry-page images now reference this file,
  avoiding the earlier missing `assets/atelier.png` problem.

The existing `cloud.js`, `supabase-config.js`, and `CNAME` must remain in the
repository. They are deliberately excluded from this update so its upload keeps
your current backend connection and domain files. The ZIP is an update to the
existing site, not a standalone replacement repository. The historical Edge
Function source `index.ts` is also excluded; it is not a deployment step here.

## Appearance

The starting look is **Atelier / Glass / 45% tint**, matching the selection in the
approved preview. Existing saved preferences take precedence.

Open **Appearance** near the bottom of the main sidebar or in an inner workspace's
top bar. Choose Dawn, Dusk, or Atelier; compare Solid and Glass; adjust tint;
or turn on Reduce transparency. Choices are stored only in this browser and
follow you between pages. System reduced transparency and contrast settings
take precedence without discarding your preference. Reduced motion disables
pointer highlights. Embedded technical tools retain their original appearance.

There is no new animation loop. Study/editor reading surfaces stay opaque;
blur is limited to outer navigation and a small number of large overview/briefing
surfaces. The effect is a CSS interpretation of Liquid Glass, not Apple's native
optical rendering system.

## Validation and remaining checks

- 61 offline behavior scenarios passed: sign-in/module adapter, AI helper, briefing
  data/controller, and appearance persistence/accessibility/embedded behavior.
- 26 release-integrity checks passed. The seven pages preserve 324 static IDs,
  all 11 original inline scripts, all seven inline style blocks, and export strings.
  All local entrypoint references resolve. Original non-entrypoint application
  files remain byte-identical to the pre-glass local baseline.
- Browser review confirmed the existing signed-in session opens the module list,
  live weather, and study workspace. Dawn, Atelier, Dusk and Solid/Glass switches
  were exercised, and palette persistence across page navigation was checked.
- No answers, reports, editor changes, image uploads, payments, or database
  migrations were submitted. Physical iPhone/iPad rendering and authenticated
  developer editing were not tested in this update.

After publication, check the artwork, sign in, open a module, switch an appearance,
reload, and open the briefing tabs. On a phone, confirm the navigation and
Appearance controls are comfortable to use. An offline news provider may show
its existing unavailable message independently of the theme.

## Return to the previous material

For an immediate visual change, choose **Appearance → Solid**. To remove the
glass update entirely, revert the release commit in GitHub and let Pages deploy
again. The seven original pages no longer request the new theme files after the
revert; extra unused files do not need to be deleted. Keep the working artwork
path or restore the `assets` folder if the older HTML references it.

## Local review

While the preview server is running, open <http://127.0.0.1:5500/>. This is the
connected application and uses the existing account. The separate earlier
`liquid-glass-preview.html` remains a visual study and is not the file to upload
as your homepage.
