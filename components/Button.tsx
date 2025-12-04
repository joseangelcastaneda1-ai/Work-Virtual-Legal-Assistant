
import React from 'react';
import Spinner from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success';
  isLoading?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  children,
  className = '',
  ...props
}) => {
  const baseClasses = 'px-6 py-2.5 rounded-md font-semibold cursor-pointer transition-colors duration-200 ease-in-out inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-orange-600 text-white hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50',
    secondary: 'bg-gray-700 text-white hover:bg-black focus:ring-2 focus:ring-gray-600 focus:ring-opacity-50',
    success: 'bg-orange-600 text-white hover:bg-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Spinner className="mr-2" />}
      {children}
    </button>
  );
};

export default Button;
