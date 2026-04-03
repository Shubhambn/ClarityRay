import { getUserProfile, updateUserSettings } from '../services/userService.js';

export function getProfileController(req, res) {
  const user = getUserProfile(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json(user);
}

export function updateSettingsController(req, res) {
  const user = updateUserSettings(req.user.id, req.body);
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  return res.json(user);
}
