const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;

export const PASSWORD_POLICY_MESSAGE =
    "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número";

export const passwordPolicyPlugin = {
    regex: PASSWORD_POLICY_REGEX,
    message: PASSWORD_POLICY_MESSAGE,
    isValid: (password: string): boolean => PASSWORD_POLICY_REGEX.test(password),
};
