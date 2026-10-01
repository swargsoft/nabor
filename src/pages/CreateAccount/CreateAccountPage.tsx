import { ChangeEvent, ReactNode, useRef, useState } from 'react';
import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  AddAPhoto,
  ArrowBack,
  ArrowForward,
  AutoAwesome,
  Check,
  DeleteOutline,
  Edit,
  Favorite,
  Interests,
  LocationOn,
  Man,
  Person,
  Star,
  Transgender,
  Woman,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import { useIdentity } from '@/hooks/useIdentity';
import { useNotification } from '@/hooks/useNotification';
import { useLocation } from '@/hooks/useLocation';
import { NaborMap } from '@/components/location/NaborMap';
import type { Gender } from '@/types/db';

const STEPS = ['Identity', 'About you', 'Interests', 'Your story', 'Location', 'Photos', 'Preview'];

const MAX_PHOTOS = 6;

const GENDERS: {
  value: Gender;
  label: string;
  icon: ReactNode;
}[] = [
  {
    value: 'man',
    label: 'Man',
    icon: <Man />,
  },
  {
    value: 'woman',
    label: 'Woman',
    icon: <Woman />,
  },
  {
    value: 'nonbinary',
    label: 'Non-binary',
    icon: <Transgender />,
  },
  {
    value: 'other',
    label: 'Other',
    icon: <AutoAwesome />,
  },
];

const INTEREST_SUGGESTIONS = [
  'Hiking',
  'Music',
  'Travel',
  'Cooking',
  'Gaming',
  'Reading',
  'Fitness',
  'Art',
  'Photography',
  'Movies',
  'Coffee',
  'Dogs',
];

type PhotoItem = {
  id: string;
  file: File;
  previewUrl: string;
};

export default function CreateAccountPage() {
  const navigate = useNavigate();

  const { createIdentity, status } = useIdentity();
  const { notify } = useNotification();

  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  /*
   * Identity
   */
  const [deviceName, setDeviceName] = useState('My Device');

  /*
   * Profile
   */
  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('man');
  const [bio, setBio] = useState('');

  /*
   * Interests
   */
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');

  /*
   * Location
   */
  const [locationEnabled, setLocationEnabled] = useState(true);

  /*
   * Photos
   */
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const parsedAge = parseInt(age, 10);
  const progress = ((step + 1) / STEPS.length) * 100;

  const { locationState, status: locationStatus, requestLocation } = useLocation(undefined);

  /*
   * ------------------------------------------------------------
   * Interests
   * ------------------------------------------------------------
   */

  const toggleInterest = (interest: string) => {
    setInterests((previous) =>
      previous.includes(interest)
        ? previous.filter((item) => item !== interest)
        : [...previous, interest],
    );
  };

  const addCustomInterest = () => {
    const value = interestInput.trim();

    if (!value) return;

    if (!interests.includes(value)) {
      setInterests((previous) => [...previous, value]);
    }

    setInterestInput('');
  };

  /*
   * ------------------------------------------------------------
   * Photos
   * ------------------------------------------------------------
   */

  const openPhotoPicker = () => {
    if (photos.length >= MAX_PHOTOS) {
      notify('You can add up to 6 photos', 'warning');
      return;
    }

    photoInputRef.current?.click();
  };

  const handlePhotoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (!files.length) return;

    const remainingSlots = MAX_PHOTOS - photos.length;

    const selectedFiles = files
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remainingSlots);

    if (!selectedFiles.length) {
      notify('Please select image files only', 'warning');
      return;
    }

    const newPhotos: PhotoItem[] = selectedFiles.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPhotos((previous) => [...previous, ...newPhotos]);

    if (files.length > remainingSlots) {
      notify(
        `Only ${remainingSlots} more photo${remainingSlots === 1 ? '' : 's'} could be added`,
        'warning',
      );
    }

    event.target.value = '';
  };

  const removePhoto = (photoId: string) => {
    setPhotos((previous) => {
      const photo = previous.find((item) => item.id === photoId);

      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }

      return previous.filter((item) => item.id !== photoId);
    });
  };

  const makeMainPhoto = (photoId: string) => {
    setPhotos((previous) => {
      const selected = previous.find((photo) => photo.id === photoId);

      if (!selected) return previous;

      return [selected, ...previous.filter((photo) => photo.id !== photoId)];
    });
  };

  /*
   * ------------------------------------------------------------
   * Validation
   * ------------------------------------------------------------
   */

  const validateStep = () => {
    switch (step) {
      case 0:
        if (!deviceName.trim()) {
          notify('Please enter a device name', 'warning');
          return false;
        }

        if (!displayName.trim()) {
          notify('Tell us your name first', 'warning');
          return false;
        }

        if (displayName.trim().length < 2) {
          notify('Your name should be at least 2 characters', 'warning');
          return false;
        }

        return true;

      case 1:
        if (Number.isNaN(parsedAge) || parsedAge < 18 || parsedAge > 120) {
          notify('Enter a valid age between 18 and 120', 'warning');
          return false;
        }

        return true;

      case 2:
        if (interests.length === 0) {
          notify('Choose at least one interest', 'warning');
          return false;
        }

        return true;

      case 3:
        return true;

      case 4:
        return true;

      case 5:
        if (photos.length === 0) {
          notify('Add at least one photo to continue', 'warning');
          return false;
        }

        return true;

      case 6:
        return true;

      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;

    setStep((previous) => Math.min(previous + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    if (step === 0) {
      navigate('/');
      return;
    }

    setStep((previous) => Math.max(previous - 1, 0));
  };

  /*
   * ------------------------------------------------------------
   * Create identity
   * ------------------------------------------------------------
   */

  const handleCreate = async () => {
    if (!validateStep()) return;

    setCreating(true);

    try {
      /*
       * IMPORTANT:
       * The device name entered in Step 1 is used
       * when generating the local Nabor identity.
       */
      await createIdentity(deviceName.trim() || 'My Device');

      notify('Your Nabor identity was created', 'success');

      /*
       * Keep the existing application flow.
       *
       * ProfilePage currently owns the actual
       * ProfileService.createProfile() call.
       */
      navigate('/profile');
    } catch {
      notify('Failed to create your account', 'error');
    } finally {
      setCreating(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * Header
   * ------------------------------------------------------------
   */

  const renderHeader = () => (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Button
          onClick={handleBack}
          startIcon={<ArrowBack />}
          disabled={creating}
          sx={{
            minWidth: 0,
            px: 1,
            color: 'text.secondary',
          }}
        >
          Back
        </Button>

        <Typography variant="body2" color="text.secondary" fontWeight={700}>
          {step + 1} of {STEPS.length}
        </Typography>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 6,
          borderRadius: 999,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
          '& .MuiLinearProgress-bar': {
            borderRadius: 999,
          },
        }}
      />
    </Box>
  );

  /*
   * ------------------------------------------------------------
   * Step title
   * ------------------------------------------------------------
   */

  const renderStepTitle = (title: string, subtitle: string, icon: ReactNode) => (
    <Box sx={{ mb: 3 }}>
      <Box
        sx={{
          width: 52,
          height: 52,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>

      <Typography
        variant="h4"
        fontWeight={800}
        letterSpacing="-0.03em"
        sx={{
          fontSize: {
            xs: '1.8rem',
            sm: '2.1rem',
          },
        }}
      >
        {title}
      </Typography>

      <Typography
        color="text.secondary"
        sx={{
          mt: 1,
          lineHeight: 1.6,
          maxWidth: 460,
        }}
      >
        {subtitle}
      </Typography>
    </Box>
  );

  /*
   * ------------------------------------------------------------
   * STEP 1 — Identity + Name
   * ------------------------------------------------------------
   */

  const renderIdentityStep = () => (
    <>
      {renderStepTitle(
        'Welcome to Nabor',
        'Let’s create your local identity and set up your profile.',
        <Favorite />,
      )}

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          mb: 2.5,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.035),
        }}
      >
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Person color="primary" />

            <Box>
              <Typography fontWeight={700}>Your identity stays on this device</Typography>

              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.5,
                  lineHeight: 1.6,
                }}
              >
                Nabor generates your identity locally. No central account server is required.
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={2.5}>
        <TextField
          autoFocus
          fullWidth
          label="Device name"
          placeholder="My Device"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          inputProps={{
            maxLength: 40,
          }}
          helperText="Give this device a name so you can recognize it later."
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
            },
          }}
        />

        <TextField
          fullWidth
          label="Display name"
          placeholder="Your name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          inputProps={{
            maxLength: 40,
          }}
          helperText={`${displayName.length}/40`}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
            },
          }}
        />
      </Stack>
    </>
  );

  /*
   * ------------------------------------------------------------
   * STEP 2 — About you
   * ------------------------------------------------------------
   */

  const renderAboutStep = () => (
    <>
      {renderStepTitle(
        'Tell us a little about you',
        'This helps people understand who they are connecting with.',
        <Person />,
      )}

      <TextField
        autoFocus
        fullWidth
        label="Age"
        type="number"
        value={age}
        onChange={(event) => setAge(event.target.value)}
        inputProps={{
          min: 18,
          max: 120,
          inputMode: 'numeric',
        }}
        helperText="You must be 18 or older to use Nabor."
        sx={{
          mb: 3,
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
          },
        }}
      />

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Gender
      </Typography>

      <Stack spacing={1.25}>
        {GENDERS.map((item) => {
          const selected = gender === item.value;

          return (
            <Card
              key={item.value}
              variant="outlined"
              onClick={() => setGender(item.value)}
              sx={{
                cursor: 'pointer',
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected
                  ? (theme) => alpha(theme.palette.primary.main, 0.06)
                  : 'background.paper',
                transition: 'all 160ms ease',
                '&:hover': {
                  borderColor: 'primary.main',
                },
              }}
            >
              <CardContent
                sx={{
                  py: 1.5,
                  '&:last-child': {
                    pb: 1.5,
                  },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: selected ? 'primary.main' : 'action.hover',
                      color: selected ? 'primary.contrastText' : 'text.secondary',
                    }}
                  >
                    {item.icon}
                  </Box>

                  <Typography fontWeight={600} flex={1}>
                    {item.label}
                  </Typography>

                  {selected && <Check color="primary" fontSize="small" />}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </>
  );

  /*
   * ------------------------------------------------------------
   * STEP 3 — Interests
   * ------------------------------------------------------------
   */

  const renderInterestsStep = () => (
    <>
      {renderStepTitle(
        'What are you into?',
        'Pick a few things you enjoy. They help people find common ground with you.',
        <Interests />,
      )}

      <Stack direction="row" flexWrap="wrap" gap={1}>
        {INTEREST_SUGGESTIONS.map((interest) => {
          const selected = interests.includes(interest);

          return (
            <Chip
              key={interest}
              label={interest}
              onClick={() => toggleInterest(interest)}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              sx={{
                borderRadius: 2.5,
                px: 0.5,
                py: 2.25,
                fontWeight: selected ? 700 : 500,
              }}
            />
          );
        })}
      </Stack>

      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Add something else
        </Typography>

        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            placeholder="e.g. Board games"
            value={interestInput}
            onChange={(event) => setInterestInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustomInterest();
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
              },
            }}
          />

          <Button
            variant="outlined"
            onClick={addCustomInterest}
            disabled={!interestInput.trim()}
            sx={{
              borderRadius: 3,
              px: 2.5,
            }}
          >
            Add
          </Button>
        </Stack>
      </Box>

      {interests.filter((interest) => !INTEREST_SUGGESTIONS.includes(interest)).length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
          {interests
            .filter((interest) => !INTEREST_SUGGESTIONS.includes(interest))
            .map((interest) => (
              <Chip
                key={interest}
                label={interest}
                color="primary"
                onDelete={() => toggleInterest(interest)}
              />
            ))}
        </Stack>
      )}

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
        {interests.length === 0 ? 'Choose at least one' : `${interests.length} selected`}
      </Typography>
    </>
  );

  /*
   * ------------------------------------------------------------
   * STEP 4 — Bio
   * ------------------------------------------------------------
   */

  const renderBioStep = () => (
    <>
      {renderStepTitle(
        'Tell people about yourself',
        'A short introduction can make it easier for someone to start a conversation.',
        <Edit />,
      )}

      <TextField
        autoFocus
        fullWidth
        multiline
        minRows={6}
        maxRows={10}
        label="Your bio"
        placeholder="A little about me..."
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        inputProps={{
          maxLength: 300,
        }}
        helperText={`${bio.length}/300`}
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 3,
          },
        }}
      />

      <Card
        variant="outlined"
        sx={{
          mt: 2,
          borderRadius: 3,
        }}
      >
        <CardContent>
          <Typography variant="body2" fontWeight={700}>
            ✨ Tip
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.5,
              lineHeight: 1.6,
            }}
          >
            Talk about what you enjoy, what you are looking for, or something that makes you smile.
          </Typography>
        </CardContent>
      </Card>
    </>
  );

  /*
   * ------------------------------------------------------------
   * STEP 5 — Location
   * ------------------------------------------------------------
   */

  const renderLocationStep = () => (
    <>
      {renderStepTitle(
        'Discover people nearby',
        'Nabor uses your location to help you discover people around you.',
        <LocationOn />,
      )}

      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          mb: 2,
          bgcolor: locationEnabled
            ? (theme) => alpha(theme.palette.primary.main, 0.04)
            : 'background.paper',
        }}
      >
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              <LocationOn />
            </Box>

            <Box flex={1}>
              <Typography fontWeight={700}>Nearby discovery</Typography>

              <Typography variant="body2" color="text.secondary">
                {locationEnabled
                  ? 'People nearby can discover your profile.'
                  : 'Your location will not be used for discovery.'}
              </Typography>
            </Box>

            <Switch
              checked={locationEnabled}
              onChange={(event) => setLocationEnabled(event.target.checked)}
            />
          </Stack>
        </CardContent>
      </Card>

      {locationEnabled && (
        <>
          <Button
            variant="outlined"
            fullWidth
            onClick={requestLocation}
            disabled={locationStatus === 'loading'}
            startIcon={<LocationOn />}
            sx={{
              borderRadius: 3,
              py: 1.25,
              mb: 2,
            }}
          >
            {locationStatus === 'loading' ? 'Getting your location…' : 'Use my current location'}
          </Button>

          {locationState && (
            <Box
              sx={{
                overflow: 'hidden',
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <NaborMap locationState={locationState} height={220} />
            </Box>
          )}
        </>
      )}

      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{
          mt: 2,
          lineHeight: 1.6,
        }}
      >
        You can change this setting later from your profile.
      </Typography>
    </>
  );

  /*
   * ------------------------------------------------------------
   * STEP 6 — Photos
   * ------------------------------------------------------------
   */

  const renderPhotosStep = () => (
    <>
      {renderStepTitle(
        'Show people the real you',
        'Add up to 6 photos to help people get to know you.',
        <AddAPhoto />,
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handlePhotoSelection}
      />

      {photos.length === 0 ? (
        <Card
          variant="outlined"
          onClick={openPhotoPicker}
          sx={{
            borderRadius: 4,
            borderStyle: 'dashed',
            borderWidth: 2,
            cursor: 'pointer',
            minHeight: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            transition: 'all 160ms ease',
            '&:hover': {
              borderColor: 'primary.main',
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.03),
            },
          }}
        >
          <Box>
            <Box
              sx={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                mx: 'auto',
                mb: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
              }}
            >
              <AddAPhoto fontSize="large" />
            </Box>

            <Typography variant="h6" fontWeight={800}>
              Add your photos
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.75,
                mb: 2,
              }}
            >
              Choose up to 6 photos from your device
            </Typography>

            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={(event) => {
                event.stopPropagation();
                openPhotoPicker();
              }}
              sx={{
                borderRadius: 3,
                px: 3,
              }}
            >
              Choose photos
            </Button>
          </Box>
        </Card>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1.25,
            }}
          >
            {photos.map((photo, index) => (
              <Box
                key={photo.id}
                sx={{
                  position: 'relative',
                  aspectRatio: index === 0 ? '1 / 1.15' : '1 / 1',
                  gridColumn: index === 0 ? 'span 2' : 'span 1',
                  borderRadius: 3,
                  overflow: 'hidden',
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: index === 0 ? 'primary.main' : 'divider',
                }}
              >
                <Box
                  component="img"
                  src={photo.previewUrl}
                  alt={index === 0 ? 'Main profile photo' : `Profile photo ${index + 1}`}
                  sx={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    objectFit: 'cover',
                  }}
                />

                {index === 0 && (
                  <Chip
                    icon={
                      <Star
                        sx={{
                          fontSize: 15,
                        }}
                      />
                    }
                    label="Main photo"
                    size="small"
                    color="primary"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      fontWeight: 700,
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '& .MuiChip-icon': {
                        color: 'inherit',
                      },
                    }}
                  />
                )}

                {index !== 0 && (
                  <Button
                    size="small"
                    onClick={() => makeMainPhoto(photo.id)}
                    sx={{
                      position: 'absolute',
                      left: 6,
                      bottom: 6,
                      minWidth: 0,
                      px: 1,
                      py: 0.5,
                      borderRadius: 2,
                      bgcolor: 'rgba(0,0,0,0.6)',
                      color: 'white',
                      fontSize: '0.68rem',
                      '&:hover': {
                        bgcolor: 'rgba(0,0,0,0.75)',
                      },
                    }}
                  >
                    Make main
                  </Button>
                )}

                <Button
                  onClick={() => removePhoto(photo.id)}
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    minWidth: 34,
                    width: 34,
                    height: 34,
                    p: 0,
                    borderRadius: '50%',
                    bgcolor: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    '&:hover': {
                      bgcolor: 'rgba(0,0,0,0.8)',
                    },
                  }}
                  aria-label="Delete photo"
                >
                  <DeleteOutline fontSize="small" />
                </Button>
              </Box>
            ))}

            {photos.length < MAX_PHOTOS && (
              <Box
                onClick={openPhotoPicker}
                sx={{
                  aspectRatio: '1 / 1',
                  borderRadius: 3,
                  border: '2px dashed',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 160ms ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Stack alignItems="center" spacing={0.5}>
                  <Add color="primary" />

                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Add photo
                  </Typography>
                </Stack>
              </Box>
            )}
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={700}>
              {photos.length} / {MAX_PHOTOS} photos
            </Typography>

            <Button
              size="small"
              startIcon={<AddAPhoto />}
              onClick={openPhotoPicker}
              disabled={photos.length >= MAX_PHOTOS}
              sx={{
                borderRadius: 2,
              }}
            >
              Add more
            </Button>
          </Stack>
        </>
      )}

      <Card
        variant="outlined"
        sx={{
          mt: 2,
          borderRadius: 3,
        }}
      >
        <CardContent>
          <Typography variant="body2" fontWeight={700}>
            📸 Make your first photo count
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.5,
              lineHeight: 1.6,
            }}
          >
            Your first photo is your main profile photo. Choose one where your face is clearly
            visible.
          </Typography>
        </CardContent>
      </Card>
    </>
  );

  /*
   * ------------------------------------------------------------
   * STEP 7 — Preview
   * ------------------------------------------------------------
   */

  const renderPreview = () => (
    <>
      {renderStepTitle(
        'Your profile is ready',
        'Take a quick look before joining Nabor.',
        <Favorite />,
      )}

      <Card
        sx={{
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
        }}
      >
        {photos.length > 0 ? (
          <Box
            sx={{
              position: 'relative',
              height: 330,
              bgcolor: 'action.hover',
            }}
          >
            <Box
              component="img"
              src={photos[0].previewUrl}
              alt="Main profile"
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />

            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent 55%)',
              }}
            />

            <Box
              sx={{
                position: 'absolute',
                left: 20,
                right: 20,
                bottom: 18,
                color: 'white',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography variant="h4" fontWeight={800}>
                  {displayName.trim() || 'Your name'}
                </Typography>

                <Typography variant="h6">{parsedAge || '—'}</Typography>
              </Stack>

              <Typography
                variant="body2"
                sx={{
                  opacity: 0.9,
                  mt: 0.25,
                }}
              >
                {GENDERS.find((item) => item.value === gender)?.label}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              height: 180,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'action.hover',
            }}
          >
            <Person
              sx={{
                fontSize: 64,
                color: 'text.disabled',
              }}
            />
          </Box>
        )}

        <CardContent sx={{ p: 3 }}>
          {bio.trim() && (
            <Typography
              variant="body2"
              sx={{
                lineHeight: 1.7,
                mb: 2,
                whiteSpace: 'pre-wrap',
              }}
            >
              {bio.trim()}
            </Typography>
          )}

          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {interests.map((interest) => (
              <Chip key={interest} label={interest} size="small" variant="outlined" />
            ))}
          </Stack>

          {locationEnabled && (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 2 }}>
              <LocationOn fontSize="small" color="primary" />

              <Typography variant="caption" color="text.secondary">
                Nearby discovery enabled
              </Typography>
            </Stack>
          )}

          {photos.length > 1 && (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                mt: 2,
                overflowX: 'auto',
                pb: 0.5,
              }}
            >
              {photos.slice(1).map((photo) => (
                <Box
                  key={photo.id}
                  component="img"
                  src={photo.previewUrl}
                  alt="Profile"
                  sx={{
                    width: 54,
                    height: 54,
                    borderRadius: 2,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card
        variant="outlined"
        sx={{
          mt: 2,
          borderRadius: 3,
        }}
      >
        <CardContent>
          <Typography variant="body2" fontWeight={700}>
            🔒 Privacy-first by design
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.5,
              lineHeight: 1.6,
            }}
          >
            Your Nabor identity is generated on your device. There is no central account server
            required.
          </Typography>
        </CardContent>
      </Card>
    </>
  );

  /*
   * ------------------------------------------------------------
   * Render current step
   * ------------------------------------------------------------
   */

  const renderCurrentStep = () => {
    switch (step) {
      case 0:
        return renderIdentityStep();

      case 1:
        return renderAboutStep();

      case 2:
        return renderInterestsStep();

      case 3:
        return renderBioStep();

      case 4:
        return renderLocationStep();

      case 5:
        return renderPhotosStep();

      case 6:
        return renderPreview();

      default:
        return null;
    }
  };

  /*
   * ------------------------------------------------------------
   * Loading
   * ------------------------------------------------------------
   */

  if (status === 'loading') {
    return (
      <Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center">
        <CircularProgress />
      </Box>
    );
  }

  /*
   * ------------------------------------------------------------
   * Page
   * ------------------------------------------------------------
   */

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        justifyContent: 'center',
        px: {
          xs: 2,
          sm: 3,
        },
        py: {
          xs: 2,
          sm: 4,
        },
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 560,
          display: 'flex',
          flexDirection: 'column',
          minHeight: {
            xs: 'calc(100vh - 32px)',
            sm: 'calc(100vh - 64px)',
          },
        }}
      >
        {renderHeader()}

        <Stepper
          activeStep={step}
          alternativeLabel
          sx={{
            mb: 4,
            display: {
              xs: 'none',
              sm: 'flex',
            },
            '& .MuiStepLabel-label': {
              fontSize: '0.72rem',
            },
          }}
        >
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            key={step}
            sx={{
              flex: 1,
              animation: 'naborStepIn 220ms ease-out',
              '@keyframes naborStepIn': {
                from: {
                  opacity: 0,
                  transform: 'translateY(8px)',
                },
                to: {
                  opacity: 1,
                  transform: 'translateY(0)',
                },
              },
            }}
          >
            {renderCurrentStep()}
          </Box>

          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              mt: 4,
              pt: 2,
              position: {
                xs: 'sticky',
                sm: 'static',
              },
              bottom: 0,
              bgcolor: 'background.default',
            }}
          >
            {step > 0 && (
              <Button
                variant="outlined"
                size="large"
                onClick={handleBack}
                disabled={creating}
                sx={{
                  minWidth: 100,
                  borderRadius: 3,
                  py: 1.4,
                }}
              >
                Back
              </Button>
            )}

            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={step === STEPS.length - 1 ? handleCreate : handleNext}
              disabled={creating}
              endIcon={
                creating ? (
                  <CircularProgress size={18} color="inherit" />
                ) : step === STEPS.length - 1 ? (
                  <Check />
                ) : (
                  <ArrowForward />
                )
              }
              sx={{
                borderRadius: 3,
                py: 1.4,
                fontWeight: 700,
                boxShadow: 'none',
                '&:hover': {
                  boxShadow: 'none',
                },
              }}
            >
              {creating
                ? 'Creating your profile…'
                : step === STEPS.length - 1
                  ? 'Create my profile'
                  : 'Continue'}
            </Button>
          </Stack>
        </Box>

        <Typography
          variant="caption"
          color="text.secondary"
          textAlign="center"
          sx={{
            mt: 3,
            pb: 1,
            lineHeight: 1.5,
          }}
        >
          Your profile information stays under your control.
        </Typography>
      </Box>
    </Box>
  );
}
