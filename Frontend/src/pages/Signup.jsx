import React, { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import PrimaryButton from '../components/ui/PrimaryButton'
import OTPModal from '../components/OTPModal'
import Toast from '../components/Toast'
import OTPTroubleshootModal from '../components/OTPTroubleshootModal'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'



const Signup = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: searchParams.get('role') || 'customer'
  })
  const [errors, setErrors] = useState({})
  const [otpOpen, setOtpOpen] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [toast, setToast] = useState(false)
  const [confirmationResult, setConfirmationResult] = useState(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [showTroubleshoot, setShowTroubleshoot] = useState(false)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  // Clean implementation of Firebase Auth with Invisible Recaptcha
  useEffect(() => {
    // 1. Initialize Recaptcha cleanly on mount
    const initRecaptcha = () => {
      // Clear any existing instances
      if (window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch (err) { console.warn("Error clearing reCAPTCHA verifier:", err); }
        window.recaptchaVerifier = null;
      }

      try {
        // Ensure DOM element exists before creating verifier
        const recaptchaContainer = document.getElementById('recaptcha-container');
        if (!recaptchaContainer) {
          // Create the container element if it doesn't exist
          const container = document.createElement('div');
          container.id = 'recaptcha-container';
          container.style.display = 'none'; // Keep invisible
          document.body.appendChild(container);
        }

        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: (response) => {
            // reCAPTCHA solved
            console.log("Recaptcha verified:", response);
          },
          'expired-callback': () => {
            console.log("Recaptcha expired");
            // Optionally re-initialize after a delay to avoid rapid re-initialization
            setTimeout(initRecaptcha, 1000);
          },
          'error-callback': (error) => {
            console.error("Recaptcha error:", error);
            setErrors({ form: "reCAPTCHA verification failed. Please try again." });
          }
        });

        // Render the widget to ensure it's properly initialized
        window.recaptchaVerifier.render()
          .then(function (widgetId) {
            console.log("reCAPTCHA widget rendered with ID:", widgetId);
          })
          .catch(function (error) {
            console.error("reCAPTCHA render error:", error);
          });
      } catch (err) {
        console.error("Failed to initialize Recaptcha:", err);
        setErrors({ form: "Failed to initialize reCAPTCHA. Please refresh the page." });
      }
    };

    initRecaptcha();

    // Cleanup on unmount
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (err) {
          console.warn("Error clearing reCAPTCHA verifier:", err);
        }
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.fullName.trim()) next.fullName = 'Full name is required'
    if (!form.phone || form.phone.replace(/\D/g, '').length < 10) next.phone = 'Valid phone required'
    if (form.email && !/.+@.+\..+/.test(form.email)) next.email = 'Enter a valid email'
    if (!otpVerified) next.otp = 'Please verify your phone number first'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    try {
      const uid = auth.currentUser?.uid
      if (!uid) { setErrors({ form: 'Phone verification required.' }); return }

      try {
        const userRef = doc(db, 'users', uid)

        const profile = {
          fullName: form.fullName.trim(),
          email: form.email || '',
          phone: form.phone.replace(/\D/g, ''),
          role: form.role,
          createdAt: new Date().toISOString()
        }

        // Background tasks
        getDoc(userRef).then(snap => {
          if (!snap.exists()) {
            setDoc(userRef, profile).catch(() => console.error("Background setDoc failed"))
          }
        }).catch(() => console.error("Background getDoc failed"))

        // Don't wait for Firestore to instantly transition!
        const merged = { id: uid, uid, ...profile }
        localStorage.setItem('currentUser', JSON.stringify(merged))
        window.dispatchEvent(new Event('authChange'))

        navigate(profile.role === 'tailor' ? '/tailor/dashboard' : '/customer')
      } catch (dbError) {
        console.error('Firestore error:', dbError)
        navigate(form.role === 'tailor' ? '/tailor/dashboard' : '/customer')
      }
    } catch (err) {
      console.error('Auth Signup Error:', err)
      setErrors({ form: `Failed to create account. Error: ${err.message || 'Network disconnected'}` })
    }
  }

  const handleGetOtp = async () => {
    if (!form.phone || form.phone.replace(/\D/g, '').length < 10) {
      setErrors({ phone: 'Enter a valid 10-digit phone number' })
      return
    }

    setOtpLoading(true)
    setErrors({})

    try {
      const phoneDigits = form.phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        setErrors({ phone: 'Phone number must be at least 10 digits' });
        setOtpLoading(false);
        return;
      }

      // Format phone number with country code
      const formattedPhone = '+91' + phoneDigits;
      console.log("Formatted phone number:", formattedPhone);

      // Failsafe: if verifier was somehow destroyed, re-create it
      if (!window.recaptchaVerifier) {
        console.log("Recreating reCAPTCHA verifier");
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          'callback': (response) => {
            console.log("reCAPTCHA verified:", response);
          },
          'expired-callback': () => {
            console.log("reCAPTCHA expired");
          }
        });
      }

      console.log("Attempting to send OTP to:", formattedPhone);
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier);

      console.log("OTP Sent Successfully:", confirmation);
      setConfirmationResult(confirmation);
      setOtpOpen(true);

    } catch (error) {
      console.error('Phone Auth Error:', error)
      let msg = error.message

      if (error.code === 'auth/invalid-app-credential') {
        msg = 'App verification failed. Please check Firebase "Authorized Domains".'
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.'
      } else if (error.code === 'auth/operation-not-allowed') {
        msg = 'Phone authentication is not enabled for this Firebase project. Please contact the administrator to enable phone authentication in Firebase Console.'
      } else if (error.code === 'auth/captcha-check-failed') {
        msg = 'Security verification failed. Please refresh the page and try again.'
      } else if (error.code === 'auth/quota-exceeded') {
        msg = 'SMS quota exceeded. Please contact support or try again later.'
      } else if (error.code === 'auth/user-disabled') {
        msg = 'This account has been disabled. Please contact support.'
      } else if (error.code.includes('network-request-failed')) {
        msg = 'Network error. Please check your internet connection and try again.'
      }

      setErrors({ phone: `Error: ${msg}` })
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyOtp = async (otp) => {
    if (!otp || otp.length !== 6) {
      setErrors({ otp: 'OTP must be exactly 6 digits.' })
      return
    }

    try {
      if (!confirmationResult) {
        setErrors({ phone: 'Session expired. Please request a new OTP.' })
        setOtpOpen(false)
        return
      }

      console.log("Attempting to confirm OTP...");
      const result = await confirmationResult.confirm(otp)
      console.log("User verified successfully:", result.user.uid)

      setOtpVerified(true)
      setOtpOpen(false)
      setErrors({})
    } catch (error) {
      console.error('OTP Verification Error:', error)
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);

      let msg = error.message;
      if (error.code === 'auth/invalid-verification-code') {
        msg = 'The OTP you entered is incorrect. Please try again.';
      } else if (error.code === 'auth/code-expired') {
        msg = 'The OTP has expired. Please request a new one.';
        setOtpOpen(false); // Close the modal since the code is expired
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your connection and try again.';
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.';
      } else {
        msg = `Verification failed: ${error.message}`;
      }

      setErrors({ otp: msg });
      // Don't close the modal here - let the user try again or request new OTP
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-neutral-50">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/">
              <img src="/logo2.png" alt="StitchUp" className="h-10 mx-auto mb-6" />
            </Link>
            <h1 className="text-2xl font-bold text-neutral-900">Create your account</h1>
            <p className="mt-2 text-neutral-500 text-sm">Join StitchUp as a customer or tailor</p>
          </div>

          <form onSubmit={onSubmit} className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
            <div className="grid grid-cols-2 rounded-lg border border-neutral-200 overflow-hidden mb-6">
              <button
                type="button"
                onClick={() => { setForm({ ...form, role: 'customer' }); setSearchParams({ role: 'customer' }, { replace: true }) }}
                className={`py-2.5 text-sm font-medium text-center transition-colors ${form.role === 'customer' ? 'bg-[color:var(--color-primary)] text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                Customer
              </button>
              <button
                type="button"
                onClick={() => { setForm({ ...form, role: 'tailor' }); setSearchParams({ role: 'tailor' }, { replace: true }) }}
                className={`py-2.5 text-sm font-medium text-center transition-colors ${form.role === 'tailor' ? 'bg-[color:var(--color-primary)] text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                Tailor
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Full Name</label>
                <input name="fullName" value={form.fullName} onChange={onChange} placeholder="John Doe"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 outline-none focus:border-[color:var(--color-primary)] focus:ring-1 focus:ring-[color:var(--color-primary)]/20 transition-all" />
                {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email <span className="text-neutral-400">(optional)</span></label>
                <input name="email" type="email" value={form.email} onChange={onChange} placeholder="you@example.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 outline-none focus:border-[color:var(--color-primary)] focus:ring-1 focus:ring-[color:var(--color-primary)]/20 transition-all" />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Phone Number</label>
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 bg-white flex-1 focus-within:border-[color:var(--color-primary)] focus-within:ring-1 focus-within:ring-[color:var(--color-primary)]/20 transition-all">
                    <span className="text-neutral-400 text-sm">+91</span>
                    <input
                      name="phone" value={form.phone}
                      onChange={(e) => { setForm({ ...form, phone: e.target.value }); if (otpVerified) setOtpVerified(false) }}
                      placeholder="98765 43210"
                      className="flex-1 outline-none bg-transparent"
                      maxLength={12}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGetOtp}
                    disabled={!form.phone || form.phone.replace(/\D/g, '').length < 10 || otpLoading}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${otpVerified
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'border border-[color:var(--color-primary)] text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary)]/5 disabled:opacity-40 disabled:cursor-not-allowed'
                      }`}
                  >
                    {otpVerified ? '✓ Verified' : otpLoading ? 'Loading Check...' : 'Get OTP'}
                  </button>
                </div>
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                {errors.otp && <p className="mt-1 text-xs text-red-600">{errors.otp}</p>}
              </div>

              {errors.form && <p className="text-sm text-red-600 text-center">{errors.form}</p>}

              <PrimaryButton type="submit" className="w-full py-3" disabled={!otpVerified}>
                Create Account
              </PrimaryButton>

              <div className="text-center mt-4">
                <button
                  type="button"
                  className="text-xs text-[color:var(--color-primary)] hover:underline"
                  onClick={() => setShowTroubleshoot(true)}
                >
                  Having trouble with OTP?
                </button>
              </div>
            </div>

            <div id="recaptcha-container"></div>
          </form>

          <p className="text-center mt-6 text-sm text-neutral-500">
            Already have an account?{' '}
            <Link to="/login" className="text-[color:var(--color-primary)] font-medium hover:underline">Log in</Link>
          </p>
        </div>
      </main>
      <Footer />
      <OTPModal open={otpOpen} onClose={() => setOtpOpen(false)} onVerify={handleVerifyOtp} />
      <Toast open={toast} type="success" message="Account created!" />
      <OTPTroubleshootModal
        isOpen={showTroubleshoot}
        onClose={() => setShowTroubleshoot(false)}
      />
    </div>
  )
}

export default Signup
