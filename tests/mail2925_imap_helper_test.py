import importlib.util
import unittest
from pathlib import Path


HELPER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "mail2925_imap_helper.py"
SPEC = importlib.util.spec_from_file_location("mail2925_imap_helper", HELPER_PATH)
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


class Mail2925ImapHelperTest(unittest.TestCase):
    def test_get_login_usernames_tries_full_email_then_local_part(self):
        self.assertEqual(
            helper.get_login_usernames("DemoUser@2925.com"),
            [
                "demouser@2925.com",
                "demouser",
            ],
        )

    def test_mail2925_imap_error_exposes_code(self):
        error = helper.Mail2925ImapError("IMAP_LOGIN_FAILED", "login failed")

        self.assertEqual(error.code, "IMAP_LOGIN_FAILED")
        self.assertEqual(str(error), "login failed")

    def test_find_code_candidates_reads_subject_preview_and_text(self):
        message = {
            "subject": "Your code is 123456",
            "bodyPreview": "old 123456 should not duplicate, new 654321",
            "text": "ignore 1234567 and keep 998877",
        }

        self.assertEqual(
            helper.find_code_candidates(message),
            ["123456", "654321", "998877"],
        )


if __name__ == "__main__":
    unittest.main()
