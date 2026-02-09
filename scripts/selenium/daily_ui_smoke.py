#!/usr/bin/env python3
import os
import sys
import time
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_URL = os.environ.get("BASE_URL", "https://mediqzy.com").rstrip("/")
LOGIN_PATH = os.environ.get("LOGIN_PATH", "/login")
APPOINTMENTS_PATH = os.environ.get("APPOINTMENTS_PATH", "/appointments")
WALLET_PATH = os.environ.get("WALLET_PATH", "/wallet")
LABS_PATH = os.environ.get("LABS_PATH", "/labs")
PRESCRIPTIONS_PATH = os.environ.get("PRESCRIPTIONS_PATH", "/prescriptions")
NOTIFICATIONS_PATH = os.environ.get("NOTIFICATIONS_PATH", "/notifications")
DOCTOR_PATH = os.environ.get("DOCTOR_PATH", "/doctor")
ADMIN_PATH = os.environ.get("ADMIN_PATH", "/admin")
ADMIN_BASE_URL = os.environ.get("ADMIN_BASE_URL", BASE_URL).rstrip("/")
ADMIN_LOGIN_PATH = os.environ.get("ADMIN_LOGIN_PATH", LOGIN_PATH)

USER_EMAIL = os.environ.get("USER_EMAIL")
USER_PASSWORD = os.environ.get("USER_PASSWORD")
DOCTOR_EMAIL = os.environ.get("DOCTOR_EMAIL")
DOCTOR_PASSWORD = os.environ.get("DOCTOR_PASSWORD")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

EMAIL_SELECTORS = os.environ.get(
    "EMAIL_SELECTORS",
    "input[name='email'],input[type='email'],input[autocomplete='email']"
).split(",")
PASSWORD_SELECTORS = os.environ.get(
    "PASSWORD_SELECTORS",
    "input[name='password'],input[type='password'],input[autocomplete='current-password']"
).split(",")
SUBMIT_SELECTORS = os.environ.get(
    "SUBMIT_SELECTORS",
    "button[type='submit'],button[data-testid='login-submit'],button"
).split(",")

DASHBOARD_READY_SELECTORS = os.environ.get(
    "DASHBOARD_READY_SELECTORS",
    "[data-testid='dashboard'],.dashboard,nav"
).split(",")
APPOINTMENTS_READY_SELECTORS = os.environ.get(
    "APPOINTMENTS_READY_SELECTORS",
    "[data-testid='appointments'],.appointments,main"
).split(",")
WALLET_READY_SELECTORS = os.environ.get(
    "WALLET_READY_SELECTORS",
    "[data-testid='wallet'],.wallet,main"
).split(",")
LABS_READY_SELECTORS = os.environ.get(
    "LABS_READY_SELECTORS",
    "[data-testid='labs'],.labs,main"
).split(",")
PRESCRIPTIONS_READY_SELECTORS = os.environ.get(
    "PRESCRIPTIONS_READY_SELECTORS",
    "[data-testid='prescriptions'],.prescriptions,main"
).split(",")
NOTIFICATIONS_READY_SELECTORS = os.environ.get(
    "NOTIFICATIONS_READY_SELECTORS",
    "[data-testid='notifications'],.notifications,main"
).split(",")
DOCTOR_READY_SELECTORS = os.environ.get(
    "DOCTOR_READY_SELECTORS",
    "[data-testid='doctor-dashboard'],.doctor-dashboard,nav"
).split(",")
ADMIN_READY_SELECTORS = os.environ.get(
    "ADMIN_READY_SELECTORS",
    "[data-testid='admin-dashboard'],.admin-dashboard,nav"
).split(",")

SCREENSHOT_DIR = os.environ.get(
    "SCREENSHOT_DIR",
    "/home/ubuntu/Mediczy/logs/selenium/screens"
)
PAGE_SOURCE_DIR = os.environ.get(
    "PAGE_SOURCE_DIR",
    "/home/ubuntu/Mediczy/logs/selenium/pages"
)

TIMEOUT = int(os.environ.get("SELENIUM_TIMEOUT", "20"))


def ensure_dirs():
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    os.makedirs(PAGE_SOURCE_DIR, exist_ok=True)


def now_stamp():
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def save_artifacts(driver, label):
    stamp = now_stamp()
    screenshot_path = os.path.join(SCREENSHOT_DIR, f"{label}-{stamp}.png")
    page_path = os.path.join(PAGE_SOURCE_DIR, f"{label}-{stamp}.html")
    try:
        driver.save_screenshot(screenshot_path)
    except Exception:
        pass
    try:
        with open(page_path, "w", encoding="utf-8") as handle:
            handle.write(driver.page_source)
    except Exception:
        pass


def wait_for_any_selector(driver, selectors, timeout):
    last_error = None
    for selector in selectors:
        selector = selector.strip()
        if not selector:
            continue
        try:
            return WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, selector))
            )
        except Exception as exc:
            last_error = exc
            continue
    raise last_error or RuntimeError("No selector matched")


def wait_for_xpath_contains(driver, text, timeout):
    xpath = f"//*[contains(., '{text}')]"
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.XPATH, xpath))
    )


def create_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1440,900")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(TIMEOUT)
    return driver


def login_and_wait(driver, base_url, login_path, email, password, ready_selectors, label):
    driver.get(f"{base_url}{login_path}")
    email_input = wait_for_any_selector(driver, EMAIL_SELECTORS, TIMEOUT)
    password_input = wait_for_any_selector(driver, PASSWORD_SELECTORS, TIMEOUT)

    email_input.clear()
    email_input.send_keys(email)
    password_input.clear()
    password_input.send_keys(password)

    submitted = False
    for selector in SUBMIT_SELECTORS:
        selector = selector.strip()
        if not selector:
            continue
        try:
            driver.find_element(By.CSS_SELECTOR, selector).click()
            submitted = True
            break
        except Exception:
            continue
    if not submitted:
        password_input.send_keys(Keys.ENTER)

    try:
        wait_for_any_selector(driver, ready_selectors, TIMEOUT)
    except Exception:
        wait_for_xpath_contains(driver, label, TIMEOUT)


def run_patient_flow():
    if not USER_EMAIL or not USER_PASSWORD:
        print("Missing USER_EMAIL or USER_PASSWORD in environment.")
        return 2

    driver = create_driver()
    try:
        print("[patient 1/6] Login + dashboard")
        login_and_wait(driver, BASE_URL, LOGIN_PATH, USER_EMAIL, USER_PASSWORD, DASHBOARD_READY_SELECTORS, "Dashboard")
        print("PASS: Patient login + dashboard")

        print("[patient 2/6] Appointments list")
        driver.get(f"{BASE_URL}{APPOINTMENTS_PATH}")
        try:
            wait_for_any_selector(driver, APPOINTMENTS_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Appointment", TIMEOUT)
        print("PASS: Patient appointments list")

        print("[patient 3/6] Wallet page")
        driver.get(f"{BASE_URL}{WALLET_PATH}")
        try:
            wait_for_any_selector(driver, WALLET_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Wallet", TIMEOUT)
        print("PASS: Patient wallet")

        print("[patient 4/6] Labs list")
        driver.get(f"{BASE_URL}{LABS_PATH}")
        try:
            wait_for_any_selector(driver, LABS_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Lab", TIMEOUT)
        print("PASS: Patient labs")

        print("[patient 5/6] Prescriptions list")
        driver.get(f"{BASE_URL}{PRESCRIPTIONS_PATH}")
        try:
            wait_for_any_selector(driver, PRESCRIPTIONS_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Prescription", TIMEOUT)
        print("PASS: Patient prescriptions")

        print("[patient 6/6] Notifications list")
        driver.get(f"{BASE_URL}{NOTIFICATIONS_PATH}")
        try:
            wait_for_any_selector(driver, NOTIFICATIONS_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Notification", TIMEOUT)
        print("PASS: Patient notifications")
        return 0
    except Exception as exc:
        print(f"FAIL (patient): {exc}")
        save_artifacts(driver, "patient-failure")
        return 1
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def run_doctor_flow():
    if not DOCTOR_EMAIL or not DOCTOR_PASSWORD:
        print("Skipping doctor flow (missing DOCTOR_EMAIL or DOCTOR_PASSWORD).")
        return 0

    driver = create_driver()
    try:
        print("[doctor] Login + dashboard")
        login_and_wait(driver, BASE_URL, LOGIN_PATH, DOCTOR_EMAIL, DOCTOR_PASSWORD, DOCTOR_READY_SELECTORS, "Doctor")
        print("PASS: Doctor login + dashboard")

        driver.get(f"{BASE_URL}{DOCTOR_PATH}")
        try:
            wait_for_any_selector(driver, DOCTOR_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Doctor", TIMEOUT)
        print("PASS: Doctor dashboard")
        return 0
    except Exception as exc:
        print(f"FAIL (doctor): {exc}")
        save_artifacts(driver, "doctor-failure")
        return 1
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def run_admin_flow():
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("Skipping admin flow (missing ADMIN_EMAIL or ADMIN_PASSWORD).")
        return 0

    driver = create_driver()
    try:
        print("[admin] Login + dashboard")
        login_and_wait(driver, ADMIN_BASE_URL, ADMIN_LOGIN_PATH, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_READY_SELECTORS, "Admin")
        print("PASS: Admin login + dashboard")

        driver.get(f"{BASE_URL}{ADMIN_PATH}")
        try:
            wait_for_any_selector(driver, ADMIN_READY_SELECTORS, TIMEOUT)
        except Exception:
            wait_for_xpath_contains(driver, "Admin", TIMEOUT)
        print("PASS: Admin dashboard")
        return 0
    except Exception as exc:
        print(f"FAIL (admin): {exc}")
        save_artifacts(driver, "admin-failure")
        return 1
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def run():
    ensure_dirs()

    results = [
        run_patient_flow(),
        run_doctor_flow(),
        run_admin_flow()
    ]

    if any(code != 0 for code in results):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run())
