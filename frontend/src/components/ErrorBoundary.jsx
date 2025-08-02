import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error: error, errorInfo: null };
    }

    //TODO: Add remote logging
    componentDidCatch(error, errorInfo) {
        console.error("Error caught by ErrorBoundary:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return <h1>Something went wrong. {this.state.error.toString()} {this.state.errorInfo?.toString()}</h1>;
        }

        return this.props.children;
    }
}

export default ErrorBoundary;