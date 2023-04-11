export default nickSchema = [
  {
    description: 'Enter your nick',
    name: 'nick',
    type: 'string',
    pattern: /^[a-zA-Z0-9\-]+$/,
    message: 'nick must be only letters, numbers, or dashes',
    required: true,
  },
];
