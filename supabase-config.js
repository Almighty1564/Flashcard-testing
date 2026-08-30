/* Flashcard Portal — Supabase connection settings.
   Both values below are browser-safe. Security is enforced by
   Supabase Auth + Row Level Security, not by hiding these.

   NEVER put the service_role key or the database password in this file. */

window.FC_CONFIG = {
  url: "https://semtnzdzpluhnkzxkquk.supabase.co",
  publishableKey: "sb_publishable__iTA6kUw3yTS1f2W0kfOig_alnmzLcz",

  /* Usernames are mapped to synthetic Supabase Auth addresses.
     tester01  ->  tester01@flashcard.invalid                  */
  emailDomain: "flashcard.invalid",

  /* Private Storage bucket that holds question/answer images. */
  imageBucket: "question-images"
};
