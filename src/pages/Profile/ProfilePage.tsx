import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '@/hooks/useIdentity';
import { useProfile } from '@/hooks/useProfile';
import { useNotification } from '@/hooks/useNotification';
import { useLocation } from '@/hooks/useLocation';
import { ProfileService } from '@/services/profile/ProfileService';
import { NaborMap } from '@/components/location/NaborMap';
import type { Gender } from '@/types/db';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'man', label: 'Man' },
  { value: 'woman', label: 'Woman' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
];

const INTEREST_SUGGESTIONS = [
  'Hiking', 'Music', 'Travel', 'Cooking', 'Gaming', 'Reading',
  'Fitness', 'Art', 'Photography', 'Movies', 'Coffee', 'Dogs',
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { status, identity } = useIdentity();
  const accountId = identity?.identity.id;
  const { profile, loading, saveProfile } = useProfile(accountId);
  const { notify } = useNotification();

  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender>('man');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const { locationState, status: locationStatus, requestLocation } = useLocation(accountId);

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === 'unauthenticated') navigate('/');
  }, [status, navigate]);

  // Populate form from existing profile
  useEffect(() => {
    if (profile && !initialized) {
      setDisplayName(profile.displayName);
      setAge(String(profile.age));
      setBio(profile.bio);
      setGender(profile.gender);
      setInterests(profile.interests);
      setLocationEnabled(profile.locationEnabled);
      setInitialized(true);
    }
  }, [profile, initialized]);

  const handleSave = async () => {
    if (!accountId) return;
    const parsedAge = parseInt(age, 10);
    if (!displayName.trim()) return notify('Display name is required', 'warning');
    if (isNaN(parsedAge) || parsedAge < 18 || parsedAge > 120) return notify('Enter a valid age (18–120)', 'warning');

    setSaving(true);
    try {
      if (!profile) {
        await ProfileService.createProfile({
          accountId,
          displayName,
          age: parsedAge,
          bio,
          gender,
          interests,
          locationEnabled,
        });
      } else {
        await saveProfile({ displayName, age: parsedAge, bio, gender, interests, locationEnabled });
      }
      notify('Profile saved', 'success');
    } catch {
      notify('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    );
  };

  const addCustomInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !interests.includes(trimmed)) {
      setInterests((prev) => [...prev, trimmed]);
    }
    setInterestInput('');
  };

  if (status === 'loading' || loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth={480} mx="auto" p={3} pb={8}>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Your profile
      </Typography>

      <Stack spacing={3}>
        <TextField
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          fullWidth
          inputProps={{ maxLength: 40 }}
        />

        <TextField
          label="Age"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          fullWidth
          type="number"
          inputProps={{ min: 18, max: 120 }}
        />

        <FormControl fullWidth>
          <InputLabel>Gender</InputLabel>
          <Select
            value={gender}
            label="Gender"
            onChange={(e) => setGender(e.target.value as Gender)}
          >
            {GENDERS.map((g) => (
              <MenuItem key={g.value} value={g.value}>
                {g.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          fullWidth
          multiline
          rows={3}
          inputProps={{ maxLength: 300 }}
          helperText={`${bio.length}/300`}
        />

        <Box>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Interests
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1} mb={1}>
            {INTEREST_SUGGESTIONS.map((interest) => (
              <Chip
                key={interest}
                label={interest}
                onClick={() => toggleInterest(interest)}
                color={interests.includes(interest) ? 'primary' : 'default'}
                variant={interests.includes(interest) ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
          </Box>
          <Box display="flex" gap={1} mt={1}>
            <TextField
              size="small"
              placeholder="Add custom interest"
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomInterest()}
              sx={{ flex: 1 }}
            />
            <Button variant="outlined" size="small" onClick={addCustomInterest}>
              Add
            </Button>
          </Box>
          {interests.filter((i) => !INTEREST_SUGGESTIONS.includes(i)).length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
              {interests
                .filter((i) => !INTEREST_SUGGESTIONS.includes(i))
                .map((i) => (
                  <Chip
                    key={i}
                    label={i}
                    onDelete={() => toggleInterest(i)}
                    color="primary"
                    size="small"
                  />
                ))}
            </Box>
          )}
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={locationEnabled}
              onChange={(e) => setLocationEnabled(e.target.checked)}
            />
          }
          label="Enable location for discovery"
        />

        {locationEnabled && (
          <Button
            variant="outlined"
            size="small"
            onClick={requestLocation}
            disabled={locationStatus === 'loading'}
          >
            {locationStatus === 'loading' ? 'Getting location…' : 'Update my location'}
          </Button>
        )}

        {locationEnabled && locationState && (
          <NaborMap locationState={locationState} height={220} />
        )}

        <Button
          variant="contained"
          size="large"
          fullWidth
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {saving ? 'Saving…' : 'Save profile'}
        </Button>

        <Button variant="text" size="small" onClick={() => navigate('/discover')}>
          Go to Discover
        </Button>
      </Stack>
    </Box>
  );
}
