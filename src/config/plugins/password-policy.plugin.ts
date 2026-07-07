const PASSWORD_POLICY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;

export const PASSWORD_POLICY_MESSAGE =
    "La contrasena debe tener al menos 8 caracteres, una mayuscula, una minuscula y un numero";

export const passwordPolicyPlugin = {
    regex: PASSWORD_POLICY_REGEX,
    message: PASSWORD_POLICY_MESSAGE,
    isValid: (password: string): boolean => PASSWORD_POLICY_REGEX.test(password),
};
