import React from 'react';

const OTPTroubleshootModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center px-4 pointer-events-none">
        <div className="card p-5 w-full max-w-md bg-white pointer-events-auto shadow-2xl">
          <div className="text-lg font-semibold text-neutral-900">OTP Troubleshooting</div>
          
          <div className="mt-4 space-y-4 text-sm text-neutral-600">
            <h3 className="font-medium text-neutral-800">Common Issues:</h3>
            
            <div className="space-y-2">
              <p><strong>1. Firebase Console Settings:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Ensure Phone Authentication is enabled in Firebase Console</li>
                <li>Check that your domain is added to "Authorized domains"</li>
                <li>Verify billing is enabled for your Firebase project (SMS costs money)</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <p><strong>2. Region Restrictions:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Firebase may restrict SMS in certain countries</li>
                <li>Check if your region is supported for SMS</li>
                <li>You might need to contact Firebase support to enable your region</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <p><strong>3. Network Issues:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Ad blockers may interfere with reCAPTCHA</li>
                <li>Try disabling ad blockers or using incognito mode</li>
                <li>Check your internet connection</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <p><strong>4. Quotas:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Free tier has daily quotas for SMS</li>
                <li>Check if you've exceeded daily limits</li>
                <li>Consider upgrading to a paid plan if needed</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button 
              className="btn-primary px-4 py-2 rounded-lg" 
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OTPTroubleshootModal;